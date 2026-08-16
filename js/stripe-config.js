/* =========================================================
   RENT2RIDE — CONFIGURATION STRIPE (paiement en ligne)
   =========================================================

   ÉTAT ACTUEL : DÉSACTIVÉ.
   Le bouton "Payer par carte" reste grisé sur reservation.html
   et boutique.html tant que STRIPE_ENABLED = false ci-dessous.

   ---------------------------------------------------------
   PRÉREQUIS AVANT D'ACTIVER (ne pas sauter une étape) :
   ---------------------------------------------------------
   1. Société (S.L.) immatriculée au Registro Mercantil,
      NIF/CIF obtenu.
   2. Compte bancaire professionnel espagnol ouvert au nom
      de la société.
   3. Compte Stripe Business créé et vérifié (KYB) avec les
      documents de la société.
   4. Clé PUBLIQUE Stripe (pk_live_...) récupérée depuis le
      dashboard Stripe → à coller ci-dessous.
   5. Clé SECRÈTE Stripe (sk_live_...) — NE JAMAIS la mettre
      dans ce fichier ni dans aucun fichier du site. Elle doit
      vivre uniquement côté serveur, dans le Cloudflare Worker
      existant (même pattern que la clé Airtable des gift
      cards) : ajouter une variable d'environnement secrète
      au Worker, PAS dans le code source.
   6. Créer un endpoint sur le Worker existant, ex :
      POST https://rent2ride-giftcards.sch-eric-es.workers.dev/create-checkout-session
      qui utilise la clé secrète pour créer une session Stripe
      Checkout côté serveur, et renvoie l'URL de paiement au
      site. Le site statique ne doit jamais manipuler la clé
      secrète directement.
   7. Vérifier les conditions actuelles Stripe pour l'Espagne
      (frais, délais de virement, documents KYB requis) sur
      https://stripe.com avant de lancer — ces informations
      évoluent et ne doivent pas être supposées à partir de ce
      commentaire.

   ---------------------------------------------------------
   POUR ACTIVER (une fois les 7 points ci-dessus validés) :
   ---------------------------------------------------------
   - Passer STRIPE_ENABLED à true
   - Renseigner STRIPE_PUBLISHABLE_KEY
   - Renseigner STRIPE_CHECKOUT_ENDPOINT (l'URL du Worker)
   - Le bouton "Payer par carte" se réactive automatiquement
     sur reservation.html et boutique.html (voir main.js /
     logique du panier, à connecter à ce fichier).
   ========================================================= */

window.STRIPE_CONFIG = {
  STRIPE_ENABLED: false,              // ⚠️ garder à false tant que les prérequis ne sont pas remplis
  STRIPE_PUBLISHABLE_KEY: "",         // ex: "pk_live_xxxxxxxxxxxx"
  STRIPE_CHECKOUT_ENDPOINT: ""        // ex: "https://rent2ride-giftcards.sch-eric-es.workers.dev/create-checkout-session"
};
