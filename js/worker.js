/* ===============================================================
   RENT2RIDE — Proxy Bons Cadeaux (Cloudflare Worker)
   ---------------------------------------------------------------
   Ce script sert d'intermédiaire sécurisé entre le site
   (rent2ride.github.io) et Airtable. Il ne révèle JAMAIS la
   clé Airtable au navigateur du client, et ne renvoie que le
   strict nécessaire (jamais les données d'un autre client).

   ROUTES PUBLIQUES :
   - POST /create         -> crée un bon cadeau après un achat, renvoie son code
   - GET  /balance         -> consulte le solde d'UN SEUL code (celui demandé)
   - POST /validate-promo  -> valide un code promo côté serveur
   - POST /loyalty-status  -> consulte le statut fidélité d'UN SEUL client (par email)
   - POST /loyalty-signup  -> auto-inscription publique, crée un client à
                              Nb_Locations = 0 (aucune réduction tant qu'il
                              n'a pas réellement loué — voir /loyalty-checkin)
   - POST /loyalty-checkin -> (usage interne Eloy, protégé par PIN) crée ou
                              incrémente un client fidélité après une location

   CONFIGURATION REQUISE (Cloudflare Dashboard > Workers > ce Worker
   > Settings > Variables) :
   - AIRTABLE_TOKEN   (secret) : ton Personal Access Token Airtable
   - AIRTABLE_BASE_ID (texte)  : commence par "app..."
   - ALLOWED_ORIGIN   (texte)  : https://rent2ride.github.io
   - STAFF_PIN        (secret) : code d'accès interne pour /loyalty-checkin

   LIMITE CONNUE SUR /loyalty-signup :
   Un champ honeypot ("website") protège contre les bots génériques qui
   remplissent tous les champs d'un formulaire automatiquement. Ce n'est PAS
   une protection contre un abus ciblé et volontaire (script écrit
   spécifiquement pour cette route) — pour ça il faudrait un vrai captcha
   (ex: Cloudflare Turnstile) ou du rate-limiting par IP (nécessite KV/Durable
   Objects, non implémenté). Risque jugé faible vu le volume attendu ; à
   renforcer si un abus réel est constaté dans Airtable.
   =============================================================== */

const TABLE_GIFTCARDS = "GiftCards";
const TABLE_PROMOCODES = "PromoCodes";
const TABLE_LOYALTY = "Clients_Fidelite";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* Génère un code lisible, du style R2R-4K9X2 */
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I pour éviter les confusions
  let code = "R2R-";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function airtableFetch(env, table, path, options = {}) {
  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return res;
}

async function handleCreate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Corps de requête invalide." }, 400, env);
  }

  const amount = Number(body.amount);
  const email = (body.email || "").trim();
  const name = (body.name || "").trim();

  if (![50, 100, 150].includes(amount)) {
    return jsonResponse({ error: "Montant invalide." }, 400, env);
  }
  if (!email) {
    return jsonResponse({ error: "E-mail requis." }, 400, env);
  }

  // Génère un code et vérifie qu'il n'existe pas déjà (très improbable, mais on vérifie).
  let code, exists = true, attempts = 0;
  while (exists && attempts < 5) {
    code = generateCode();
    const check = await airtableFetch(
      env,
      TABLE_GIFTCARDS,
      `?filterByFormula=${encodeURIComponent(`{Code}="${code}"`)}`
    );
    const checkData = await check.json();
    exists = (checkData.records || []).length > 0;
    attempts++;
  }
  if (exists) {
    return jsonResponse({ error: "Impossible de générer un code unique, réessayez." }, 500, env);
  }

  const createRes = await airtableFetch(env, TABLE_GIFTCARDS, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Code: code,
        InitialAmount: amount,
        Balance: amount,
        Email: email,
        Name: name,
        Status: "Active",
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    return jsonResponse({ error: "Erreur Airtable lors de la création.", detail: errText }, 502, env);
  }

  return jsonResponse({ code, amount }, 200, env);
}

async function handleBalance(request, env) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();

  if (!code) {
    return jsonResponse({ error: "Code manquant." }, 400, env);
  }

  const res = await airtableFetch(
    env,
    TABLE_GIFTCARDS,
    `?filterByFormula=${encodeURIComponent(`{Code}="${code}"`)}`
  );
  const data = await res.json();
  const record = (data.records || [])[0];

  if (!record) {
    return jsonResponse({ error: "not_found" }, 404, env);
  }

  // On ne renvoie QUE ce qui concerne ce code précis – jamais l'email,
  // le nom, ni aucune donnée des autres clients.
  return jsonResponse(
    {
      balance: record.fields.Balance,
      initialAmount: record.fields.InitialAmount,
      status: record.fields.Status,
    },
    200,
    env
  );
}

/* --------------------------------------------------------------
   STATUT FIDÉLITÉ (Rent2Ride Club) — lookup par email
   --------------------------------------------------------------
   Table Airtable "Clients_Fidelite" attendue avec les champs :
   - Nom
   - Email
   - Nb_Locations
   - Statut (formule)
   - Reduction_Pct (formule)
   - Code_Parrainage (formule)
   - Credit_Parrainage_Disponible

   Ne renvoie que les infos du client demandé (jamais la liste
   complète), même logique que handleBalance pour les gift cards.
   -------------------------------------------------------------- */
async function handleLoyaltyStatus(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Corps de requête invalide." }, 400, env);
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email) {
    return jsonResponse({ found: false, error: "E-mail requis." }, 400, env);
  }

  const res = await airtableFetch(
    env,
    TABLE_LOYALTY,
    `?filterByFormula=${encodeURIComponent(`LOWER({Email})="${email}"`)}`
  );
  const data = await res.json();
  const record = (data.records || [])[0];

  if (!record) {
    return jsonResponse({ found: false }, 200, env);
  }

  const f = record.fields;

  return jsonResponse(
    {
      found: true,
      name: f.Nom || null,
      nbLocations: Number(f.Nb_Locations || 0),
      referralCode: f.Code_Parrainage || null,
      referralCreditAvailable: Number(f.Credit_Parrainage_Disponible || 0),
    },
    200,
    env
  );
}

/* --------------------------------------------------------------
   AUTO-INSCRIPTION PUBLIQUE — POST /loyalty-signup
   --------------------------------------------------------------
   Route publique, accessible à n'importe quel visiteur depuis
   fidelite.html. Crée une fiche client à Nb_Locations = 0 : le
   client apparaît dans le programme mais n'a AUCUNE réduction et
   AUCUN code de parrainage (la formule Code_Parrainage exige
   Nb_Locations >= 1) tant qu'Eloy n'a pas confirmé une vraie
   location via /loyalty-checkin. Impossible d'obtenir un avantage
   simplement en s'inscrivant.

   Si l'email existe déjà, ne fait AUCUNE modification — renvoie
   simplement son statut actuel (évite d'écraser un historique
   existant par une inscription en double).
   -------------------------------------------------------------- */
async function handleLoyaltySignup(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Corps de requête invalide." }, 400, env);
  }

  // Anti-bot honeypot : ce champ doit rester vide pour un vrai visiteur.
  // Un bot générique qui remplit tous les champs du formulaire tombera dedans.
  // On renvoie un succès factice (200, jamais d'erreur explicite) pour ne pas
  // donner d'indice au bot que sa requête a été détectée et rejetée.
  if ((body.website || "").trim() !== "") {
    return jsonResponse({ success: true, alreadyExists: false, name: null, nbLocations: 0, referralCode: null }, 200, env);
  }

  const email = (body.email || "").trim().toLowerCase();
  const name = (body.name || "").trim();
  const phone = (body.phone || "").trim();

  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: "E-mail invalide." }, 400, env);
  }
  if (!name) {
    return jsonResponse({ error: "Nom requis." }, 400, env);
  }

  const searchRes = await airtableFetch(
    env,
    TABLE_LOYALTY,
    `?filterByFormula=${encodeURIComponent(`LOWER({Email})="${email}"`)}`
  );
  const searchData = await searchRes.json();
  const existing = (searchData.records || [])[0];

  if (existing) {
    // Déjà inscrit — ne rien modifier, juste renvoyer son statut actuel.
    const f = existing.fields;
    return jsonResponse(
      {
        success: true,
        alreadyExists: true,
        name: f.Nom || null,
        nbLocations: Number(f.Nb_Locations || 0),
        referralCode: f.Code_Parrainage || null,
      },
      200,
      env
    );
  }

  const fields = { Nom: name, Email: email, Nb_Locations: 0 };
  if (phone) fields.Telephone = phone;

  const createRes = await airtableFetch(env, TABLE_LOYALTY, "", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    return jsonResponse({ error: "Erreur Airtable lors de l'inscription.", detail: errText }, 502, env);
  }

  const record = await createRes.json();
  const f = record.fields;

  return jsonResponse(
    {
      success: true,
      alreadyExists: false,
      name: f.Nom || null,
      nbLocations: Number(f.Nb_Locations || 0),
      referralCode: f.Code_Parrainage || null,
    },
    200,
    env
  );
}

/* --------------------------------------------------------------
   CHECK-IN FIDÉLITÉ (usage interne Eloy) — POST /loyalty-checkin
   --------------------------------------------------------------
   Route protégée par un code d'accès simple (STAFF_PIN, à ajouter
   dans Settings > Variables and secrets du Worker, type "Secret").
   Ce n'est PAS un vrai système d'authentification — juste un
   filtre basique pour éviter qu'un lien trouvé par hasard permette
   de modifier les données clients. Suffisant pour un usage interne
   à 2 personnes, pas pour un vrai contrôle d'accès professionnel.

   Comportement :
   - Si le client (par email) existe déjà -> Nb_Locations += 1
   - Si le client n'existe pas -> création avec Nb_Locations = 1
   - Renvoie le statut à jour + les infos nécessaires pour générer
     le message de remerciement côté page espace-eloy.html
   -------------------------------------------------------------- */
async function handleLoyaltyCheckin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Corps de requête invalide." }, 400, env);
  }

  const pin = (body.pin || "").trim();
  if (!env.STAFF_PIN || pin !== env.STAFF_PIN) {
    return jsonResponse({ error: "Code d'accès incorrect." }, 401, env);
  }

  const email = (body.email || "").trim().toLowerCase();
  const name = (body.name || "").trim();

  if (!email) {
    return jsonResponse({ error: "E-mail requis." }, 400, env);
  }

  const searchRes = await airtableFetch(
    env,
    TABLE_LOYALTY,
    `?filterByFormula=${encodeURIComponent(`LOWER({Email})="${email}"`)}`
  );
  const searchData = await searchRes.json();
  const existing = (searchData.records || [])[0];

  let record;

  if (existing) {
    const currentCount = Number(existing.fields.Nb_Locations || 0);
    const updateRes = await airtableFetch(env, TABLE_LOYALTY, `/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Nb_Locations: currentCount + 1 },
      }),
    });
    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return jsonResponse({ error: "Erreur Airtable lors de la mise à jour.", detail: errText }, 502, env);
    }
    record = await updateRes.json();
  } else {
    const createRes = await airtableFetch(env, TABLE_LOYALTY, "", {
      method: "POST",
      body: JSON.stringify({
        fields: {
          Nom: name || email.split("@")[0],
          Email: email,
          Nb_Locations: 1,
        },
      }),
    });
    if (!createRes.ok) {
      const errText = await createRes.text();
      return jsonResponse({ error: "Erreur Airtable lors de la création.", detail: errText }, 502, env);
    }
    record = await createRes.json();
  }

  const f = record.fields;

  return jsonResponse(
    {
      success: true,
      name: f.Nom || null,
      email: f.Email || email,
      nbLocations: Number(f.Nb_Locations || 0),
      referralCode: f.Code_Parrainage || null,
      isNewClient: !existing,
    },
    200,
    env
  );
}

/* -----------------------------------------------------------
   VALIDATION CODE PROMO (côté serveur)
   -----------------------------------------------------------
   Le code et son pourcentage ne sont JAMAIS visibles dans le
   code source du site (contrairement à l'ancien système en
   dur dans main.js). Chaque appel à cette route qui valide un
   code compte comme "une utilisation" et incrémente UsedCount
   dans Airtable – même si le client ne va pas jusqu'au bout
   de sa réservation. C'est un choix simple et volontaire :
   pas de suivi de commande complète côté site statique, donc
   on plafonne à la vérification plutôt qu'à la confirmation
   finale. À voir si c'est suffisant selon le volume
   réel de trafic/abus observé.

   Table Airtable "PromoCodes" attendue avec les champs :
   - Code            (texte, ex: "BIENVENUE10")
   - DiscountPercent (nombre, ex: 10)
   - MaxUses         (nombre, ex: 100 – vide/0 = illimité)
   - UsedCount       (nombre, démarre à 0)
   - Active          (case à cocher)

   Limite connue : deux requêtes simultanées sur le même code
   proche de sa limite pourraient toutes les deux passer avant
   que le compteur soit mis à jour (pas de verrou atomique côté
   Airtable via API REST standard). Risque faible vu le volume
   attendu d'un site de location de motos, mais à garder en tête.
   ----------------------------------------------------------- */
async function handleValidatePromo(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Corps de requête invalide." }, 400, env);
  }

  const code = (body.code || "").trim().toUpperCase();
  if (!code) {
    return jsonResponse({ error: "Code manquant." }, 400, env);
  }

  const res = await airtableFetch(
    env,
    TABLE_PROMOCODES,
    `?filterByFormula=${encodeURIComponent(`{Code}="${code}"`)}`
  );
  const data = await res.json();
  const record = (data.records || [])[0];

  if (!record) {
    return jsonResponse({ valid: false, reason: "not_found" }, 200, env);
  }

  const f = record.fields;
  const active = f.Active === true;
  const usedCount = Number(f.UsedCount || 0);
  const maxUses = Number(f.MaxUses || 0); // 0 ou vide = illimité
  const maxedOut = maxUses > 0 && usedCount >= maxUses;

  if (!active) {
    return jsonResponse({ valid: false, reason: "inactive" }, 200, env);
  }
  if (maxedOut) {
    return jsonResponse({ valid: false, reason: "max_uses_reached" }, 200, env);
  }

  // Incrémente le compteur d'utilisation (voir limite connue ci-dessus).
  await airtableFetch(env, TABLE_PROMOCODES, `/${record.id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { UsedCount: usedCount + 1 } }),
  });

  return jsonResponse(
    { valid: true, discountPercent: Number(f.DiscountPercent || 0) },
    200,
    env
  );
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      return handleCreate(request, env);
    }
    if (url.pathname === "/balance" && request.method === "GET") {
      return handleBalance(request, env);
    }
    if (url.pathname === "/validate-promo" && request.method === "POST") {
      return handleValidatePromo(request, env);
    }
    if (url.pathname === "/loyalty-status" && request.method === "POST") {
      return handleLoyaltyStatus(request, env);
    }
    if (url.pathname === "/loyalty-signup" && request.method === "POST") {
      return handleLoyaltySignup(request, env);
    }
    if (url.pathname === "/loyalty-checkin" && request.method === "POST") {
      return handleLoyaltyCheckin(request, env);
    }

    return jsonResponse({ error: "Route inconnue." }, 404, env);
  },
};
