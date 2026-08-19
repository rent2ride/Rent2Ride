/* =========================================================
   RENT2RIDE — Proxy Bons Cadeaux (Cloudflare Worker)
   ---------------------------------------------------------
   Ce script sert d'intermédiaire sécurisé entre le site
   (rent2ride.github.io) et Airtable. Il ne révèle JAMAIS la
   clé Airtable au navigateur du client, et ne renvoie que le
   strict nécessaire (jamais les données d'un autre client).

   DEUX ROUTES PUBLIQUES :
   - POST /create   -> crée un bon cadeau après un achat, renvoie son code
   - GET  /balance  -> consulte le solde d'UN SEUL code (celui demandé)

   CONFIGURATION REQUISE (Cloudflare Dashboard > Workers > ce Worker
   > Settings > Variables) :
   - AIRTABLE_TOKEN   (secret)  : ton Personal Access Token Airtable
   - AIRTABLE_BASE_ID (texte)   : commence par "app..."
   - ALLOWED_ORIGIN   (texte)   : https://rent2ride.github.io
   ========================================================= */

const TABLE_GIFTCARDS = "GiftCards";
const TABLE_PROMOCODES = "PromoCodes";

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

  // On ne renvoie QUE ce qui concerne ce code précis — jamais l'email,
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

/* ---------------------------------------------------------
   VALIDATION CODE PROMO (côté serveur)
   ---------------------------------------------------------
   Le code et son pourcentage ne sont JAMAIS visibles dans le
   code source du site (contrairement à l'ancien système en
   dur dans main.js). Chaque appel à cette route qui valide un
   code compte comme "une utilisation" et incrémente UsedCount
   dans Airtable — même si le client ne va pas jusqu'au bout
   de sa réservation. C'est un choix simple et volontaire :
   pas de suivi de commande complète côté site statique, donc
   on plafonne à la vérification plutôt qu'à la confirmation
   finale. À voir si c'est suffisant selon le volume
   réel de trafic/abus observé.

   Table Airtable "PromoCodes" attendue avec les champs :
     - Code            (texte, ex: "BIENVENUE10")
     - DiscountPercent (nombre, ex: 10)
     - MaxUses         (nombre, ex: 100 — vide/0 = illimité)
     - UsedCount       (nombre, démarre à 0)
     - Active          (case à cocher)

   Limite connue : deux requêtes simultanées sur le même code
   proche de sa limite pourraient toutes les deux passer avant
   que le compteur soit mis à jour (pas de verrou atomique côté
   Airtable via API REST standard). Risque faible vu le volume
   attendu d'un site de location de motos, mais à garder en tête.
   --------------------------------------------------------- */
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

    return jsonResponse({ error: "Route inconnue." }, 404, env);
  },
};
