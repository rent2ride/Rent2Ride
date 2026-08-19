// ============================================================
// À AJOUTER à ton Worker Cloudflare existant (celui qui gère déjà
// /validate-promo et les gift cards vers la base Airtable "Rent2Ride").
//
// Ceci N'EST PAS un fichier complet — c'est le bloc à insérer dans
// ton routeur existant, + la fonction handleLoyaltyStatus.
// Adapte les noms de variables (AIRTABLE_API_KEY, AIRTABLE_BASE_ID)
// à ceux déjà utilisés dans ton Worker actuel.
// ============================================================

// --- Dans ton routeur principal (là où tu fais déjà
//     if (url.pathname === "/validate-promo") { ... }) ---
//
// if (url.pathname === "/loyalty-status" && request.method === "POST") {
//   return handleLoyaltyStatus(request, env);
// }

async function handleLoyaltyStatus(request, env) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // idéalement restreindre à ton domaine
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ found: false, error: "missing_email" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Recherche dans Airtable — table Clients_Fidelite, filtre sur Email
    const airtableUrl = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/Clients_Fidelite?filterByFormula=LOWER({Email})="${normalizedEmail}"`;

    const airtableRes = await fetch(airtableUrl, {
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      },
    });

    if (!airtableRes.ok) {
      return new Response(JSON.stringify({ found: false, error: "airtable_error" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const airtableData = await airtableRes.json();

    if (!airtableData.records || airtableData.records.length === 0) {
      return new Response(JSON.stringify({ found: false }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const record = airtableData.records[0].fields;

    return new Response(
      JSON.stringify({
        found: true,
        name: record.Nom || null,
        nbLocations: record.Nb_Locations || 0,
        referralCode: record.Code_Parrainage || null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ found: false, error: "server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

// N'oublie pas de gérer OPTIONS (preflight CORS) si ce n'est pas déjà
// fait globalement dans ton Worker :
//
// if (request.method === "OPTIONS") {
//   return new Response(null, { headers: corsHeaders });
// }
