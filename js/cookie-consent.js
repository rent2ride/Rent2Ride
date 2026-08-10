/* ============================================================
   Rent2Ride — Bandeau consentement cookies + GA4 conditionnel
   RGPD-compliant : GA4 ne se charge QUE si l'utilisateur accepte.
   Dépend de i18n.js (doit être chargé avant ce fichier) pour
   récupérer la langue courante et les textes traduits.
   ============================================================ */

(function () {
  var GA_MEASUREMENT_ID = "G-MM2MB27X9H";
  var STORAGE_KEY = "r2r_cookie_consent"; // valeurs possibles: "accepted" | "declined"

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  function loadGA4() {
    if (window.__ga4Loaded) return;
    window.__ga4Loaded = true;

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true });
  }

  // Récupère un texte traduit via le système i18n existant du site.
  // Suppose une structure i18n = { clé: { fr:"", es:"", en:"" } } et une
  // fonction ou variable globale indiquant la langue courante.
  function t(key, fallback) {
    try {
      var lang = (window.currentLang || document.documentElement.lang || "fr").slice(0, 2);
      if (window.i18n && window.i18n[key] && window.i18n[key][lang]) {
        return window.i18n[key][lang];
      }
    } catch (e) {}
    return fallback;
  }

  function buildBanner() {
    var banner = document.createElement("div");
    banner.id = "r2r-cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.style.cssText = [
      "position:fixed", "left:0", "right:0", "bottom:0", "z-index:9999",
      "background:#111", "color:#fff", "padding:18px 20px",
      "display:flex", "flex-wrap:wrap", "gap:14px",
      "align-items:center", "justify-content:center",
      "font-family:Inter,system-ui,sans-serif", "font-size:.9rem",
      "box-shadow:0 -2px 12px rgba(0,0,0,.25)"
    ].join(";");

    var text = document.createElement("p");
    text.style.cssText = "margin:0; max-width:520px; line-height:1.5; flex:1 1 260px;";
    text.textContent = t("cookie_text",
      "Nous utilisons des cookies de mesure d'audience pour comprendre comment vous utilisez notre site. Vous pouvez accepter ou refuser librement.");

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:10px; flex-wrap:wrap;";

    var declineBtn = document.createElement("button");
    declineBtn.textContent = t("cookie_decline", "Refuser");
    declineBtn.style.cssText = [
      "padding:10px 18px", "border-radius:999px", "border:1px solid rgba(255,255,255,.4)",
      "background:transparent", "color:#fff", "cursor:pointer", "font-weight:600"
    ].join(";");

    var acceptBtn = document.createElement("button");
    acceptBtn.textContent = t("cookie_accept", "Accepter");
    acceptBtn.style.cssText = [
      "padding:10px 18px", "border-radius:999px", "border:none",
      "background:#E63946", "color:#fff", "cursor:pointer", "font-weight:600"
    ].join(";");

    declineBtn.addEventListener("click", function () {
      setConsent("declined");
      removeBanner();
    });

    acceptBtn.addEventListener("click", function () {
      setConsent("accepted");
      loadGA4();
      removeBanner();
    });

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);
    banner.appendChild(text);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  function removeBanner() {
    var el = document.getElementById("r2r-cookie-banner");
    if (el) el.remove();
  }

  function initManageLink() {
    // Permet de rouvrir le bandeau depuis un lien "Gérer les cookies" en footer.
    // Ajoutez <a href="#" id="r2r-manage-cookies">Gérer les cookies</a> dans le footer.
    var link = document.getElementById("r2r-manage-cookies");
    if (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        removeBanner();
        buildBanner();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initManageLink();
    var consent = getConsent();
    if (consent === "accepted") {
      loadGA4();
    } else if (consent === "declined") {
      // rien à charger
    } else {
      buildBanner();
    }
  });
})();
