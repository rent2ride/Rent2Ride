/* Service worker minimal — nécessaire pour que le site soit "installable"
   (PWA). Ne fait pas de cache agressif volontairement : on privilégie
   toujours la version en ligne la plus fraîche plutôt que le hors-ligne,
   pour un site qui change encore souvent. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", () => {}); // laisse passer toutes les requêtes normalement
