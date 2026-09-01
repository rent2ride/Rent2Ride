/* =========================================================
   RENT2RIDE — MAIN APPLICATION SCRIPT
   ========================================================= */

// Configuration & Fallbacks de sécurité pour i18n
let currentLang = localStorage.getItem('r2r_lang') || 'fr';

function getTranslation(key, lang = currentLang) {
    if (typeof TRANSLATIONS !== 'undefined' && TRANSLATIONS[key]) {
        return TRANSLATIONS[key][lang] || TRANSLATIONS[key]['fr'] || key;
    }
    return key;
}

function updatePageTranslations(lang = currentLang) {
    currentLang = lang;
    localStorage.setItem('r2r_lang', lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = getTranslation(key, lang);
        if (translation) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        const key = el.getAttribute("data-i18n-placeholder");
        const entry = TRANSLATIONS[key];
        if (entry && entry[lang] !== undefined){
            el.setAttribute("placeholder", entry[lang]);
        }
    });

    const titleEl = document.querySelector("title[data-i18n]");
    if (titleEl){
        const key = titleEl.getAttribute("data-i18n");
        if (TRANSLATIONS[key]) document.title = TRANSLATIONS[key][lang];
    }

    document.querySelectorAll(".lang-switch button").forEach(btn => {
        const btnLang = btn.dataset.lang || btn.getAttribute('onclick');
        btn.classList.toggle("active", btnLang && btnLang.includes(lang));
    });

    if (typeof renderCalendar === "function" && document.getElementById("calendarGrid")){
        renderCalendar();
        updateBookingSummary();
    }

    if (typeof updateWhatsAppLink === "function") updateWhatsAppLink();
    if (typeof refreshAvailabilityBadges === "function") refreshAvailabilityBadges();
    if (typeof updateAvailabilityCounter === "function") updateAvailabilityCounter();
    if (typeof renderCartDrawer === "function") renderCartDrawer();

    if (typeof updateClubBanner === "function") updateClubBanner(lang);
    updateInclusBanner(lang);
}

/* =========================================================
   RENT2RIDE — PREMIUM EDITION
   main.js
   ---------------------------------------------------------
   Sections:
   1. PRICING DATA & WHATSAPP NUMBER
   2. LANGUAGE SWITCHER
   3. MOBILE NAV TOGGLE
   4. BOOKING CALENDAR
   5. BOOKING FORM (price calculation)
   6. CONTACT FORM
   7. FAQ ACCORDION
   8. GALLERY LIGHTBOX
   9. WHATSAPP WIDGET
   ========================================================= */

const PRICING = {
  mt07:     { day: 55,  week: 339,  month: 1155, deposit: 300, key: "bike_mt07_name" },
  mt09:     { day: 75,  week: 462,  month: 1575, deposit: 500, key: "bike_mt09_name" },
  tracer7:  { day: 65,  week: 401,  month: 1365, deposit: 400, key: "bike_tracer7_name" },
  tracer9:  { day: 89,  week: 549,  month: 1869, deposit: 600, key: "bike_tracer9_name" },
};

const PACKS = {
  p1: { name: "Explorer",        days: 1  },
  p2: { name: "Weekend Escape",  days: 2  },
  p3: { name: "Costa Ride",      days: 3  },
  p4: { name: "Freedom",         days: 5  },
  p5: { name: "Adventure Week",  days: 7  },
  p6: { name: "Grand Tour",      days: 14 },
};

const PERMANENTLY_UNAVAILABLE = ["mt09", "tracer7", "tracer9"];

function isModelPermanentlyUnavailable(model){
  return PERMANENTLY_UNAVAILABLE.includes(model);
}

let appliedPromoCode = null;
const WHATSAPP_NUMBER = "34649115400";
const NOTIF_FORM_ENDPOINT = "https://formspree.io/f/xvkpadnq";

function sendTelegramNotification(text){
  if (!NOTIF_FORM_ENDPOINT) return;
  fetch(NOTIF_FORM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ message: text }),
  }).catch(err => console.error("Erreur envoi notification:", err));
}

const MOMOVEN_URL = "https://www.momoven.com";

/* =========================================================
   2. LANGUAGE SWITCHER
   ========================================================= */
const LANGS = ["fr", "es", "en"];
const STORAGE_KEY = "cds_lang";

function getCurrentLang(){
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && LANGS.includes(stored)) return stored;
  const nav = (navigator.language || "fr").slice(0,2);
  return LANGS.includes(nav) ? nav : "fr";
}

function setLang(lang){
  if (!LANGS.includes(lang)) return;
  localStorage.setItem(STORAGE_KEY, lang);
  updatePageTranslations(lang);
}

function initLangSwitcher(){
  document.querySelectorAll(".lang-switch button").forEach(btn => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });
  updatePageTranslations(getCurrentLang());
}

/* =========================================================
   3. MOBILE NAV TOGGLE
   ========================================================= */
function initMobileNav(){
  const burger = document.querySelector(".burger");
  const links = document.querySelector(".nav-links");
  if (!burger || !links) return;
  burger.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

/* =========================================================
   4. BOOKING CALENDAR
   ========================================================= */
let calendarViewDate = new Date();
calendarViewDate.setDate(1);
let selectedRange = { start: null, end: null };
let selectedPackId = null;

const CALENDAR_STRINGS = {
  fr: {
    months: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
    days: ["Lu","Ma","Me","Je","Ve","Sa","Di"],
  },
  es: {
    months: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
    days: ["Lu","Ma","Mi","Ju","Vi","Sá","Do"],
  },
  en: {
    months: ["January","February","March","April","May","June","July","August","September","October","November","December"],
    days: ["Mo","Tu","We","Th","Fr","Sa","Su"],
  },
};

function pad(n){ return n.toString().padStart(2,"0"); }
function toISO(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function isSameDay(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function isBetween(d, a, b){ return a && b && d > a && d < b; }

function renderCalendar(){
  const grid = document.getElementById("calendarGrid");
  const headEl = document.getElementById("calendarMonthLabel");
  if (!grid || !headEl) return;

  const lang = getCurrentLang();
  const strings = CALENDAR_STRINGS[lang] || CALENDAR_STRINGS.fr;

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  headEl.textContent = `${strings.months[month]} ${year}`;

  grid.innerHTML = "";

  strings.days.forEach(d => {
    const el = document.createElement("div");
    el.className = "dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstOfMonth = new Date(year, month, 1);
  let startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  for (let i = 0; i < startOffset; i++){
    const el = document.createElement("div");
    el.className = "calendar-day empty";
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++){
    const date = new Date(year, month, day);
    const el = document.createElement("div");
    el.className = "calendar-day";
    el.textContent = day;
    el.setAttribute("role","button");
    el.setAttribute("tabindex","0");

    if (date < today){
      el.classList.add("past");
    } else {
      if (isSameDay(date, selectedRange.start) || isSameDay(date, selectedRange.end)){
        el.classList.add("selected");
      } else if (isBetween(date, selectedRange.start, selectedRange.end)){
        el.classList.add("in-range");
      }
      const activate = () => onCalendarDayClick(date);
      el.addEventListener("click", activate);
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " "){ e.preventDefault(); activate(); }
      });
    }
    grid.appendChild(el);
  }
}

function onCalendarDayClick(date){
  if (!selectedRange.start || (selectedRange.start && selectedRange.end)){
    selectedRange = { start: date, end: null };
  } else {
    if (date < selectedRange.start){
      selectedRange = { start: date, end: selectedRange.start };
    } else if (isSameDay(date, selectedRange.start)){
      selectedRange = { start: date, end: null };
    } else {
      selectedRange.end = date;
    }
  }
  syncDateInputs();
  renderCalendar();
  updateBookingSummary();
}

function syncDateInputs(){
  const pickup = document.getElementById("pickupDate");
  const ret = document.getElementById("returnDate");
  if (pickup) pickup.value = selectedRange.start ? toISO(selectedRange.start) : "";
  if (ret) ret.value = selectedRange.end ? toISO(selectedRange.end) : "";

  const pickupLabel = document.getElementById("pickupLabel");
  const returnLabel = document.getElementById("returnLabel");
  if (pickupLabel) pickupLabel.textContent = selectedRange.start ? formatDateHuman(selectedRange.start) : "—";
  if (returnLabel) returnLabel.textContent = selectedRange.end ? formatDateHuman(selectedRange.end) : "—";
}

function formatDateHuman(date){
  const lang = getCurrentLang();
  const strings = CALENDAR_STRINGS[lang] || CALENDAR_STRINGS.fr;
  return `${date.getDate()} ${strings.months[date.getMonth()]} ${date.getFullYear()}`;
}

function initCalendarNav(){
  const prev = document.getElementById("calPrev");
  const next = document.getElementById("calNext");
  if (prev) prev.addEventListener("click", () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
    renderCalendar();
  });
  if (next) next.addEventListener("click", () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
    renderCalendar();
  });
}

/* =========================================================
   5. BOOKING FORM
   ========================================================= */
function getNumberOfDays(){
  if (!selectedRange.start || !selectedRange.end) return 0;
  const ms = selectedRange.end - selectedRange.start;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function calculateTotal(modelKey, days){
  const model = PRICING[modelKey];
  if (!model || days <= 0) return { total: 0, rate: model ? model.day : 0 };

  if (days >= 30){
    const months = Math.floor(days / 30);
    const remainderDays = days % 30;
    return { total: months * model.month + remainderDays * model.day, rate: model.day };
  }
  if (days >= 7){
    const weeks = Math.floor(days / 7);
    const remainderDays = days % 7;
    return { total: weeks * model.week + remainderDays * model.day, rate: model.day };
  }
  return { total: days * model.day, rate: model.day };
}

function updateBookingSummary(){
  const modelSelect = document.getElementById("bookingModel");
  const daysOut = document.getElementById("summaryDays");
  const rateOut = document.getElementById("summaryRate");
  const totalOut = document.getElementById("summaryTotal");
  if (!modelSelect || !daysOut || !rateOut || !totalOut) return;

  const days = getNumberOfDays();
  const { total, rate } = calculateTotal(modelSelect.value, days);

  daysOut.textContent = days > 0 ? days : "—";
  rateOut.textContent = `${rate} €`;

  const discountRow = document.getElementById("summaryDiscountRow");
  const discountOut = document.getElementById("summaryDiscount");
  const hoursFeeRow = document.getElementById("summaryHoursFeeRow");
  const hoursFeeOut = document.getElementById("summaryHoursFee");

  const pickupTime = document.getElementById("pickupTime");
  const returnTime = document.getElementById("returnTime");
  let hoursFee = 0;
  if (pickupTime?.value === "off-hours") hoursFee += OFF_HOURS_FEE;
  if (returnTime?.value === "off-hours") hoursFee += OFF_HOURS_FEE;
  if (hoursFeeRow && hoursFeeOut){
    hoursFeeRow.style.display = hoursFee > 0 ? "flex" : "none";
    hoursFeeOut.textContent = `+${hoursFee} €`;
  }

  const baseForDiscount = total;

  if (appliedPromoCode && total > 0){
    const pct = appliedPromoCode.percent;
    const discountAmount = Math.round(baseForDiscount * pct / 100);
    const finalTotal = baseForDiscount - discountAmount + hoursFee;
    if (discountRow) discountRow.style.display = "flex";
    if (discountOut) discountOut.textContent = `-${discountAmount} € (${appliedPromoCode.code})`;
    totalOut.textContent = `${finalTotal} €`;
  } else {
    if (discountRow) discountRow.style.display = "none";
    totalOut.textContent = total > 0 ? `${total + hoursFee} €` : (hoursFee > 0 ? `${hoursFee} €` : "—");
  }
}

function initPromoCode(){
  const input = document.getElementById("promoCodeInput");
  const btn = document.getElementById("promoCodeApply");
  const feedback = document.getElementById("promoCodeFeedback");
  if (!input || !btn) return;

  btn.addEventListener("click", async () => {
    const code = input.value.trim().toUpperCase();
    const lang = getCurrentLang();

    if (!code){
      appliedPromoCode = null;
      updateBookingSummary();
      return;
    }

    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "...";
    if (feedback){
      feedback.textContent = "";
      feedback.className = "promo-feedback";
    }

    try {
      const base = window.GIFTCARD_API_BASE;
      const res = await fetch(`${base}/validate-promo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (data.valid){
        appliedPromoCode = { code, percent: data.discountPercent };
        if (feedback){
          feedback.textContent = `${TRANSLATIONS.promo_valid[lang]} (-${data.discountPercent}%)`;
          feedback.className = "promo-feedback is-valid";
        }
      } else {
        appliedPromoCode = null;
        if (feedback){
          feedback.textContent = TRANSLATIONS.promo_invalid[lang];
          feedback.className = "promo-feedback is-invalid";
        }
      }
    } catch (err){
      appliedPromoCode = null;
      if (feedback){
        feedback.textContent = TRANSLATIONS.promo_invalid[lang];
        feedback.className = "promo-feedback is-invalid";
      }
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
      updateBookingSummary();
    }
  });
}

function formatBookingDate(d){
  if (!d) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function buildBookingSummaryText(form, modelKey){
  const model = PRICING[modelKey];
  const modelName = model ? TRANSLATIONS[model.key]["fr"] : modelKey;
  const days = getNumberOfDays();
  const { total, rate } = calculateTotal(modelKey, days);

  const name = form.querySelector("#fullName")?.value.trim() || "";
  const email = form.querySelector("#email")?.value.trim() || "";
  const phone = form.querySelector("#phone")?.value.trim() || "";
  const pickupTime = form.querySelector("#pickupTime")?.value || "";
  const returnTime = form.querySelector("#returnTime")?.value || "";

  let hoursFee = 0;
  if (pickupTime === "off-hours") hoursFee += OFF_HOURS_FEE;
  if (returnTime === "off-hours") hoursFee += OFF_HOURS_FEE;
  const pickupTimeLabel = pickupTime === "off-hours" ? "Hors créneaux standards (à confirmer)" : pickupTime;
  const returnTimeLabel = returnTime === "off-hours" ? "Hors créneaux standards (à confirmer)" : returnTime;

  let finalTotal = total + hoursFee;
  let discountLine = "";
  if (appliedPromoCode && total > 0){
    const pct = appliedPromoCode.percent;
    const discountAmount = Math.round(total * pct / 100);
    finalTotal = total - discountAmount + hoursFee;
    discountLine = `\nCode promo : ${appliedPromoCode.code} (-${discountAmount} €)`;
  }
  const hoursFeeLine = hoursFee > 0 ? `\nSupplément hors horaires : +${hoursFee} €` : "";
  const packLine = selectedPackId && PACKS[selectedPackId]
    ? `Pack demandé : ${PACKS[selectedPackId].name} (${PACKS[selectedPackId].days} jours)\n`
    : "";

  return `Demande de réservation Rent2Ride\n\n` +
    packLine +
    `Moto : ${modelName}\n` +
    `Du ${formatBookingDate(selectedRange.start)} au ${formatBookingDate(selectedRange.end)} (${days} jours)\n` +
    `Collecte : ${pickupTimeLabel}   Retour : ${returnTimeLabel}\n` +
    `Tarif journalier : ${rate} €${discountLine}${hoursFeeLine}\n` +
    `Total estimé : ${finalTotal} €\n\n` +
    `Nom : ${name}\n` +
    `Contact : ${[email, phone].filter(Boolean).join(" / ")}`;
}

function initBookingForm(){
  const form = document.getElementById("bookingForm");
  if (!form) return;

  const modelSelect = document.getElementById("bookingModel");
  if (modelSelect){
    const lang = getCurrentLang();
    Array.from(modelSelect.options).forEach(opt => {
      if (isModelPermanentlyUnavailable(opt.value)){
        opt.disabled = true;
        opt.textContent = `${TRANSLATIONS[PRICING[opt.value].key][lang]} — ${TRANSLATIONS.status_unavailable[lang]}`;
      }
    });

    const firstAvailable = Array.from(modelSelect.options).find(opt => !opt.disabled);
    if (firstAvailable) modelSelect.value = firstAvailable.value;

    modelSelect.addEventListener("change", updateBookingSummary);

    const params = new URLSearchParams(window.location.search);
    const requestedModel = params.get("model");
    if (requestedModel && PRICING[requestedModel] && !isModelPermanentlyUnavailable(requestedModel)){
      modelSelect.value = requestedModel;
    }
  }

  const packParams = new URLSearchParams(window.location.search);
  const requestedPack = packParams.get("pack");
  if (requestedPack && PACKS[requestedPack]){
    selectedPackId = requestedPack;
    const pack = PACKS[requestedPack];

    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(end.getDate() + pack.days - 1);
    selectedRange = { start, end };
    syncDateInputs();
    renderCalendar();
    updateBookingSummary();

    const banner = document.createElement("div");
    banner.className = "pack-selected-banner";
    banner.style.cssText = "background:var(--c-primary,#1a1a1a); color:#fff; padding:12px 18px; border-radius:8px; margin-bottom:18px; font-size:0.95rem;";
    banner.textContent = `Pack sélectionné : ${pack.name} (${pack.days} jour${pack.days > 1 ? "s" : ""}) — modifiable ci-dessous si besoin.`;
    form.parentNode.insertBefore(banner, form);
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const success = document.getElementById("bookingSuccess");
    const warning = document.getElementById("bookingWarning");

    if (modelSelect && isModelPermanentlyUnavailable(modelSelect.value)){
      if (warning){
        warning.textContent = TRANSLATIONS.status_unavailable[getCurrentLang()];
        warning.classList.add("show");
      }
      return;
    }

    if (!selectedRange.start || !selectedRange.end){
      if (warning){
        warning.textContent = TRANSLATIONS.form_select_dates_first[getCurrentLang()];
        warning.classList.add("show");
      }
      return;
    }
    if (warning) warning.classList.remove("show");

    saveBooking(modelSelect.value, selectedRange.start, selectedRange.end);

    const summary = buildBookingSummaryText(form, modelSelect.value);
    sendTelegramNotification(summary);

    const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`;
    window.open(waUrl, "_blank", "noopener");

    const subject = encodeURIComponent("Demande de réservation Rent2Ride");
    const body = encodeURIComponent(summary);
    const mailtoUrl = `mailto:info@rent2ride.com?subject=${subject}&body=${body}`;
    setTimeout(() => { window.location.href = mailtoUrl; }, 400);

    if (success) success.classList.add("show");
    const printBtn = document.getElementById("printConfirmBtn");
    if (printBtn){
      printBtn.style.display = "inline-flex";
      printBtn.onclick = () => window.print();
    }
    form.reset();
    selectedRange = { start: null, end: null };
    selectedPackId = null;
    appliedPromoCode = null;
    const promoFeedback = document.getElementById("promoCodeFeedback");
    if (promoFeedback) promoFeedback.textContent = "";
    syncDateInputs();
    renderCalendar();
    updateBookingSummary();
  });

  updateBookingSummary();
}

/* =========================================================
   6. CONTACT FORM
   ========================================================= */
function initContactForm(){
  const form = document.getElementById("contactForm");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const success = document.getElementById("contactSuccess");
    if (success) success.classList.add("show");
    form.reset();
  });
}

/* =========================================================
   7. FAQ ACCORDION
   ========================================================= */
function initFaqAccordion(){
  document.querySelectorAll(".faq-item").forEach(item => {
    const question = item.querySelector(".faq-question");
    if (!question) return;
    question.addEventListener("click", () => {
      const wasOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item.open").forEach(other => {
        if (other !== item) other.classList.remove("open");
      });
      item.classList.toggle("open", !wasOpen);
    });
  });
}

/* =========================================================
   8. GALLERY LIGHTBOX
   ========================================================= */
function initGalleryLightbox(){
  const items = Array.from(document.querySelectorAll(".gallery-item"));
  const lightbox = document.getElementById("lightbox");
  if (!items.length || !lightbox) return;

  const imgEl = document.getElementById("lightboxImg");
  const closeBtn = document.getElementById("lightboxClose");
  const prevBtn = document.getElementById("lightboxPrev");
  const nextBtn = document.getElementById("lightboxNext");
  let currentIndex = 0;

  function openAt(index){
    currentIndex = (index + items.length) % items.length;
    const bg = items[currentIndex].style.getPropertyValue("--gal-img");
    const url = bg.replace(/^url\((['"]?)(.*)\1\)$/, "$2");
    imgEl.src = url;
    imgEl.alt = items[currentIndex].getAttribute("data-caption") || "";
    lightbox.classList.add("open");
  }
  function close(){ lightbox.classList.remove("open"); }

  items.forEach((item, index) => {
    item.addEventListener("click", () => openAt(index));
  });
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (prevBtn) prevBtn.addEventListener("click", () => openAt(currentIndex - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => openAt(currentIndex + 1));
  lightbox.addEventListener("click", e => { if (e.target === lightbox) close(); });
  document.addEventListener("keydown", e => {
    if (!lightbox.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") openAt(currentIndex - 1);
    if (e.key === "ArrowRight") openAt(currentIndex + 1);
  });
}

/* =========================================================
   9. WHATSAPP WIDGET
   ========================================================= */
function updateWhatsAppLink(){
  const link = document.getElementById("whatsappLink");
  if (!link) return;
  const lang = getCurrentLang();
  const text = encodeURIComponent(TRANSLATIONS.wa_default_text[lang]);
  link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

function initWhatsAppWidget(){
  const bubble = document.getElementById("whatsappBubble");
  const panel = document.getElementById("whatsappPanel");
  if (!bubble || !panel) return;
  bubble.addEventListener("click", () => {
    panel.classList.toggle("open");
  });
  updateWhatsAppLink();
}

function initMomovenLinks(){
  document.querySelectorAll(".momoven-link").forEach(link => {
    link.href = MOMOVEN_URL;
  });
}

/* =========================================================
   DISPONIBILITÉ AUTOMATIQUE DES MOTOS
   ========================================================= */
const BOOKINGS_KEY = "rent2ride_bookings";

function saveBooking(model, start, end){
  if (!model || !start || !end) return;
  const bookings = JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
  bookings.push({
    model,
    start: toISO(start),
    end: toISO(end)
  });
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
}

function getBookings(){
  return JSON.parse(localStorage.getItem(BOOKINGS_KEY) || "[]");
}

function isModelBookedOn(model, date = new Date()){
  const d = toISO(date);
  return getBookings().some(b => b.model === model && d >= b.start && d <= b.end);
}

function isModelUnavailable(model, date = new Date()){
  return isModelPermanentlyUnavailable(model) || isModelBookedOn(model, date);
}

function refreshAvailabilityBadges(){
  document.querySelectorAll(".bike-card[data-model]").forEach(card => {
    const model = card.dataset.model;
    const unavailable = isModelUnavailable(model);
    const badge = card.querySelector(".bike-availability");
    const btn = card.querySelector(".bike-price-row .btn");
    const lang = getCurrentLang();

    card.classList.toggle("unavailable", unavailable);

    if (badge){
      badge.classList.toggle("is-available", !unavailable);
      badge.classList.toggle("is-unavailable", unavailable);
      badge.textContent = unavailable
        ? TRANSLATIONS.status_unavailable[lang]
        : TRANSLATIONS.status_available[lang];
    }
    if (btn){
      btn.textContent = unavailable
        ? TRANSLATIONS.bike_unavailable_btn[lang]
        : TRANSLATIONS.bike_cta[lang];
    }
  });

  document.querySelectorAll(".compare-table [data-model]").forEach(el => {
    const model = el.dataset.model;
    const unavailable = isModelUnavailable(model);
    const lang = getCurrentLang();

    el.classList.toggle("is-disabled", unavailable);
    el.style.opacity = unavailable ? ".5" : "";
    el.style.pointerEvents = unavailable ? "none" : "";
    el.style.cursor = unavailable ? "not-allowed" : "";
    el.textContent = unavailable
      ? TRANSLATIONS.bike_unavailable_btn[lang]
      : TRANSLATIONS.bike_cta[lang];
    if (unavailable){
      el.removeAttribute("href");
    } else if (!el.getAttribute("href")){
      el.setAttribute("href", `reservation.html?model=${model}#booking`);
    }
  });
}

function updateAvailabilityCounter(){
  const el = document.getElementById("availabilityCounter");
  const cards = document.querySelectorAll(".bike-card[data-model]");
  if (!el || !cards.length) return;
  const lang = getCurrentLang();
  let available = 0;
  cards.forEach(card => { if (!isModelUnavailable(card.dataset.model)) available++; });
  el.classList.toggle("is-low", available <= 1);
  const template = TRANSLATIONS.availability_counter[lang];
  el.textContent = template.replace("{n}", available).replace("{total}", cards.length);
}

function clearAllBookings(){
  localStorage.removeItem(BOOKINGS_KEY);
  refreshAvailabilityBadges();
  if (typeof updateAvailabilityCounter === "function") updateAvailabilityCounter();
}

/* =========================================================
   10. BOUTIQUE — PANIER (SHOPPING CART)
   ========================================================= */
window.GIFTCARD_API_BASE = "https://rent2ride-giftcards.sch-eric-es.workers.dev";

const SHOP_PRODUCTS = {
  tshirt: {
    price: 24.90,
    nameKey: "prod_tshirt_name",
    descKey: "prod_tshirt_desc",
    sizes: ["S","M","L","XL","XXL"],
    colors: ["black","white","red","grey"],
  },
  hoodie: {
    price: 44.90,
    nameKey: "prod_hoodie_name",
    descKey: "prod_hoodie_desc",
    sizes: ["S","M","L","XL","XXL"],
    colors: ["black","white","red","grey"],
  },
  cap: {
    price: 19.90,
    nameKey: "prod_cap_name",
    descKey: "prod_cap_desc",
    sizes: null,
    colors: ["black","white","red","grey"],
  },
  stickers: {
    price: 6.90,
    nameKey: "prod_stickers_name",
    descKey: "prod_stickers_desc",
    sizes: null,
    colors: null,
  },
  giftcard: {
    price: null,
    nameKey: "prod_giftcard_name",
    descKey: "prod_giftcard_desc",
    sizes: ["50", "100", "150"],
    colors: null,
  },
};

const SHOP_STOCK = {
  "tshirt|S|black": 6,   "tshirt|S|white": 5,   "tshirt|S|red": 4,   "tshirt|S|grey": 4,
  "tshirt|M|black": 8,   "tshirt|M|white": 7,   "tshirt|M|red": 6,   "tshirt|M|grey": 6,
  "tshirt|L|black": 8,   "tshirt|L|white": 6,   "tshirt|L|red": 5,   "tshirt|L|grey": 5,
  "tshirt|XL|black": 4,  "tshirt|XL|white": 3,  "tshirt|XL|red": 3,  "tshirt|XL|grey": 2,
  "tshirt|XXL|black": 2, "tshirt|XXL|white": 0, "tshirt|XXL|red": 2, "tshirt|XXL|grey": 0,

  "hoodie|S|black": 3,   "hoodie|S|white": 2,   "hoodie|S|red": 2,   "hoodie|S|grey": 2,
  "hoodie|M|black": 5,   "hoodie|M|white": 4,   "hoodie|M|red": 3,   "hoodie|M|grey": 3,
  "hoodie|L|black": 5,   "hoodie|L|white": 3,   "hoodie|L|red": 3,   "hoodie|L|grey": 2,
  "hoodie|XL|black": 2,  "hoodie|XL|white": 2,  "hoodie|XL|red": 1,  "hoodie|XL|grey": 1,
  "hoodie|XXL|black": 1, "hoodie|XXL|white": 0,  "hoodie|XXL|red": 1, "hoodie|XXL|grey": 0,

  "cap|-|black": 10, "cap|-|white": 6, "cap|-|red": 6, "cap|-|grey": 4,

  "stickers|-|-": 40,
};

const STOCK_LOW_THRESHOLD = 3;
const SHOP_OPEN = false;

const PRICE_TIERS = [
  { days: 1,  price: 89  },
  { days: 2,  price: 169 },
  { days: 3,  price: 239 },
  { days: 5,  price: 379 },
  { days: 7,  price: 499 },
  { days: 14, price: 949 },
];

function estimatePrice(days){
  if (days <= PRICE_TIERS[0].days) return PRICE_TIERS[0].price;
  const last = PRICE_TIERS[PRICE_TIERS.length - 1];
  if (days >= last.days){
    const prevTier = PRICE_TIERS[PRICE_TIERS.length - 2];
    const dailyRate = (last.price - prevTier.price) / (last.days - prevTier.days);
    return Math.round(last.price + (days - last.days) * dailyRate);
  }
  for (let i = 0; i < PRICE_TIERS.length - 1; i++){
    const a = PRICE_TIERS[i], b = PRICE_TIERS[i + 1];
    if (days >= a.days && days <= b.days){
      const ratio = (days - a.days) / (b.days - a.days);
      return Math.round(a.price + ratio * (b.price - a.price));
    }
  }
  return PRICE_TIERS[0].price;
}

function initPriceCalculator(){
  const slider = document.getElementById("calcDays");
  const daysLabel = document.getElementById("calcDaysValue");
  const amountEl = document.getElementById("calcAmount");
  if (!slider) return;

  function render(){
    const days = parseInt(slider.value, 10);
    daysLabel.textContent = days;
    amountEl.textContent = estimatePrice(days) + " €";
  }
  slider.addEventListener("input", render);
  render();
}

const SHOP_IMAGES = {
  tshirt: {
    black: { front: "./images/shop-tshirt-black-front.jpg", back: "./images/shop-tshirt-black-back.jpg" },
    white: { front: "./images/shop-tshirt-white-front.jpg", back: "./images/shop-tshirt-white-back.jpg" },
    red:   { front: "./images/shop-tshirt-red-front.jpg",   back: "./images/shop-tshirt-red-back.jpg" },
    grey:  { front: "./images/shop-tshirt-grey-front.jpg",  back: "./images/shop-tshirt-grey-back.jpg" },
  },
  hoodie: {
    black: { front: "./images/shop-hoodie-black-front.jpg", back: "./images/shop-hoodie-black-back.jpg" },
    white: { front: "./images/shop-hoodie-white-front.jpg", back: "./images/shop-hoodie-white-back.jpg" },
    red:   { front: "./images/shop-hoodie-red-front.jpg",   back: "./images/shop-hoodie-red-back.jpg" },
    grey:  { front: "./images/shop-hoodie-grey-front.jpg",  back: "./images/shop-hoodie-grey-back.jpg" },
  },
  cap: {
    black: { front: "./images/shop-cap-black-front.jpg", back: null },
    white: { front: "./images/shop-cap-white-front.jpg", back: null },
    red:   { front: "./images/shop-cap-red-front.jpg",   back: null },
    grey:  { front: "./images/shop-cap-grey-front.jpg",  back: null },
  },
  stickers: {},
};

const SHOP_IMAGE_FALLBACK = {
  tshirt: "./images/shop-tshirt-black-front.jpg",
  hoodie: "./images/shop-hoodie-black-front.jpg",
  cap: "./images/shop-cap-black-front.jpg",
  stickers: "./images/shop-stickers.jpg",
};

function getStockFor(productId, size, color){
  const key = cartLineId(productId, size, color);
  const val = SHOP_STOCK[key];
  return typeof val === "number" ? val : 0;
}

function getStockRemaining(productId, size, color){
  const total = getStockFor(productId, size, color);
  const lineId = cartLineId(productId, size, color);
  const inCart = getCart().find(i => i.lineId === lineId);
  return total - (inCart ? inCart.qty : 0);
}

const CART_STORAGE_KEY = "rent2ride_cart";

function getCart(){
  try { return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]"); }
  catch(e){ return []; }
}

function saveCart(cart){
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function cartLineId(productId, size, color){
  return [productId, size || "-", color || "-"].join("|");
}

function addToCart(productId, size, color, qty = 1){
  const product = SHOP_PRODUCTS[productId];
  if (!product) return;
  const price = productId === "giftcard" ? parseInt(size, 10) : product.price;
  const cart = getCart();
  const lineId = cartLineId(productId, size, color);
  const existing = cart.find(i => i.lineId === lineId);
  if (existing){
    existing.qty += qty;
  } else {
    cart.push({ lineId, productId, size: size || null, color: color || null, qty, price });
  }
  saveCart(cart);
  renderCartDrawer();
}

function updateCartLineQty(lineId, qty){
  let cart = getCart();
  if (qty <= 0){
    cart = cart.filter(i => i.lineId !== lineId);
  } else {
    const line = cart.find(i => i.lineId === lineId);
    if (line) line.qty = qty;
  }
  saveCart(cart);
  renderCartDrawer();
}

function removeCartLine(lineId){
  updateCartLineQty(lineId, 0);
}

function cartCount(){
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

function cartTotal(){
  return getCart().reduce((sum, i) => sum + i.qty * i.price, 0);
}

function formatPrice(n){
  return n.toFixed(2).replace(".", ",") + " €";
}

function updateCartBadge(){
  document.querySelectorAll(".cart-badge").forEach(el => {
    const count = cartCount();
    el.textContent = count;
    el.classList.toggle("is-visible", count > 0);
  });
}

function colorLabel(color, lang){
  const key = { black: "shop_color_black", white: "shop_color_white", sand: "shop_color_sand", red: "shop_color_red", grey: "shop_color_grey" }[color];
  return key ? TRANSLATIONS[key][lang] : "";
}

function renderCartDrawer(){
  const list = document.getElementById("cartItems");
  const emptyEl = document.getElementById("cartEmpty");
  const footerEl = document.getElementById("cartFooter");
  if (!list) return;

  const cart = getCart();
  const lang = getCurrentLang();
  list.innerHTML = "";

  if (cart.length === 0){
    if (emptyEl) emptyEl.style.display = "flex";
    if (footerEl) footerEl.style.display = "none";
    refreshAllStockDisplays();
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  if (footerEl) footerEl.style.display = "block";

  cart.forEach(item => {
    const product = SHOP_PRODUCTS[item.productId];
    if (!product) return;
    const name = TRANSLATIONS[product.nameKey][lang];
    const variantBits = [];
    if (item.size) variantBits.push(item.productId === "giftcard" ? `${item.size} €` : item.size);
    if (item.color) variantBits.push(colorLabel(item.color, lang));

    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div class="cart-item-thumb" data-color="${item.color || ''}"><img src="./images/logo-badge.png" alt=""></div>
      <div class="cart-item-info">
        <strong>${name}</strong>
        ${variantBits.length ? `<span class="cart-item-variant">${variantBits.join(" · ")}</span>` : ""}
        <div class="cart-item-qty">
          <button type="button" class="qty-btn" data-action="dec">−</button>
          <span>${item.qty}</span>
          <button type="button" class="qty-btn" data-action="inc">+</button>
          <button type="button" class="cart-item-remove" data-i18n="cart_remove">${TRANSLATIONS.cart_remove[lang]}</button>
        </div>
      </div>
      <div class="cart-item-price">${formatPrice(item.price * item.qty)}</div>
    `;
    row.querySelector('[data-action="dec"]').addEventListener("click", () => updateCartLineQty(item.lineId, item.qty - 1));
    row.querySelector('[data-action="inc"]').addEventListener("click", () => {
      if (item.productId !== "giftcard"){
        const totalStock = getStockFor(item.productId, item.size, item.color);
        if (item.qty + 1 > totalStock) return;
      }
      updateCartLineQty(item.lineId, item.qty + 1);
    });
    row.querySelector(".cart-item-remove").addEventListener("click", () => removeCartLine(item.lineId));
    list.appendChild(row);
  });

  const totalEl = document.getElementById("cartTotal");
  if (totalEl) totalEl.textContent = formatPrice(cartTotal());

  refreshAllStockDisplays();
}

function openCartDrawer(){
  const drawer = document.getElementById("cartDrawer");
  if (!drawer) return;
  renderCartDrawer();
  drawer.classList.add("open");
  document.body.classList.add("cart-open");
}

function closeCartDrawer(){
  const drawer = document.getElementById("cartDrawer");
  if (!drawer) return;
  drawer.classList.remove("open");
  document.body.classList.remove("cart-open");
}

function openCheckoutPanel(){
  const drawer = document.getElementById("cartDrawer");
  const cartView = document.getElementById("cartView");
  const checkoutView = document.getElementById("checkoutView");
  if (!drawer || getCart().length === 0) return;
  if (cartView) cartView.style.display = "none";
  if (checkoutView) checkoutView.style.display = "flex";
}

function backToCartView(){
  const cartView = document.getElementById("cartView");
  const checkoutView = document.getElementById("checkoutView");
  if (cartView) cartView.style.display = "flex";
  if (checkoutView) checkoutView.style.display = "none";
}

function buildOrderSummaryText(name, contact, address, note){
  const lang = getCurrentLang();
  const cart = getCart();
  const lines = cart.map(item => {
    const product = SHOP_PRODUCTS[item.productId];
    const pname = TRANSLATIONS[product.nameKey][lang];
    const variantBits = [];
    if (item.size) variantBits.push(item.productId === "giftcard" ? `${item.size} €` : item.size);
    if (item.color) variantBits.push(colorLabel(item.color, lang));
    const variant = variantBits.length ? ` (${variantBits.join(", ")})` : "";
    return `• ${item.qty} x ${pname}${variant} — ${formatPrice(item.price * item.qty)}`;
  });
  let text = `Commande boutique Rent2Ride\n\n${lines.join("\n")}\n\nTotal : ${formatPrice(cartTotal())}\n\nNom : ${name}`;
  if (contact) text += `\nContact : ${contact}`;
  if (address) text += `\nAdresse de livraison : ${address}`;
  if (note) text += `\nNote : ${note}`;
  return text;
}

async function createGiftCardsForCart(cart, name, email){
  const giftItems = cart.filter(item => item.productId === "giftcard");
  if (!giftItems.length || !window.GIFTCARD_API_BASE) return [];

  const codes = [];
  for (const item of giftItems){
    for (let i = 0; i < item.qty; i++){
      try {
        const res = await fetch(`${window.GIFTCARD_API_BASE}/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: Number(item.size), email, name }),
        });
        if (res.ok){
          const data = await res.json();
          codes.push({ amount: data.amount, code: data.code });
        }
      } catch (err){}
    }
  }
  return codes;
}

async function handleCheckoutSubmit(){
  const nameEl = document.getElementById("checkoutName");
  const emailEl = document.getElementById("checkoutEmail");
  const phoneEl = document.getElementById("checkoutPhone");
  const addressEl = document.getElementById("checkoutAddress");
  const noteEl = document.getElementById("checkoutNote");
  const errorEl = document.getElementById("checkoutError");
  const sendBtn = document.getElementById("checkoutSendBtn");

  const name = (nameEl?.value || "").trim();
  const email = (emailEl?.value || "").trim();
  const phone = (phoneEl?.value || "").trim();
  const address = (addressEl?.value || "").trim();
  const note = (noteEl?.value || "").trim();

  if (!name || (!email && !phone)){
    if (errorEl) errorEl.style.display = "block";
    return;
  }
  if (errorEl) errorEl.style.display = "none";

  const contact = [email, phone].filter(Boolean).join(" / ");
  const cart = getCart();

  if (sendBtn) sendBtn.disabled = true;

  const giftCodes = await createGiftCardsForCart(cart, name, email);

  let summary = buildOrderSummaryText(name, contact, address, note);
  if (giftCodes.length){
    const lines = giftCodes.map(g => `  • ${g.amount} € — code : ${g.code}`);
    summary += `\n\nBon(s) cadeau généré(s) :\n${lines.join("\n")}`;
  }

  if (sendBtn) sendBtn.disabled = false;

  sendTelegramNotification(summary);

  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`;
  window.open(waUrl, "_blank", "noopener");

  const subject = encodeURIComponent("Commande boutique Rent2Ride");
  const body = encodeURIComponent(summary);
  const mailtoUrl = `mailto:info@rent2ride.com?subject=${subject}&body=${body}`;
  setTimeout(() => { window.location.href = mailtoUrl; }, 400);
}

function getSelectedVariant(card, productId){
  const sizeInput = card.querySelector('input[name="size-' + productId + '"]:checked');
  const colorInput = card.querySelector('input[name="color-' + productId + '"]:checked');
  return { size: sizeInput ? sizeInput.value : null, color: colorInput ? colorInput.value : null };
}

function updateProductImage(card){
  const productId = card.dataset.product;
  const imgEl = card.querySelector(".product-main-img");
  const toggle = card.querySelector("[data-view-toggle]");
  if (!imgEl) return;

  const { color } = getSelectedVariant(card, productId);
  const colorKey = color || "default";
  const views = (SHOP_IMAGES[productId] && SHOP_IMAGES[productId][colorKey]) || null;

  let view = card.dataset.currentView || "front";
  const hasBack = !!(views && views.back);
  const finalUrl = (views && (view === "back" && hasBack ? views.back : views.front))
    || SHOP_IMAGE_FALLBACK[productId];

  imgEl.src = finalUrl;
  card.dataset.currentView = (view === "back" && hasBack) ? "back" : "front";

  if (toggle){
    toggle.style.display = hasBack ? "flex" : "none";
    toggle.querySelectorAll("button").forEach(b => {
      b.classList.toggle("active", b.dataset.view === card.dataset.currentView);
    });
  }
}

function initProductGalleries(){
  document.querySelectorAll(".product-card").forEach(card => {
    card.dataset.currentView = "front";
    updateProductImage(card);

    card.querySelectorAll('input[name^="color-"]').forEach(input => {
      input.addEventListener("change", () => updateProductImage(card));
    });

    const toggle = card.querySelector("[data-view-toggle]");
    if (toggle){
      toggle.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
          card.dataset.currentView = btn.dataset.view;
          updateProductImage(card);
        });
      });
    }
  });
}

function updateStockDisplay(card){
  const productId = card.dataset.product;
  const badge = card.querySelector(".stock-badge");
  const addBtn = card.querySelector(".product-add");
  if (!badge || !addBtn) return;
  const lang = getCurrentLang();

  if (!SHOP_OPEN && productId !== "giftcard"){
    badge.textContent = TRANSLATIONS.shop_closed[lang];
    badge.classList.remove("stock-in", "stock-low");
    badge.classList.add("stock-out");
    addBtn.disabled = true;
    addBtn.textContent = TRANSLATIONS.shop_closed_btn[lang];
    return;
  }

  if (productId === "giftcard"){
    badge.textContent = "";
    badge.classList.remove("stock-in", "stock-low", "stock-out");
    addBtn.disabled = false;
    const { size } = getSelectedVariant(card, productId);
    const priceEl = document.getElementById("giftcardPriceDisplay");
    if (priceEl && size) priceEl.textContent = `${size} €`;
    return;
  }

  const { size, color } = getSelectedVariant(card, productId);
  const remaining = getStockRemaining(productId, size, color);

  badge.classList.remove("stock-in", "stock-low", "stock-out");

  if (remaining <= 0){
    badge.textContent = TRANSLATIONS.stock_out[lang];
    badge.classList.add("stock-out");
    addBtn.disabled = true;
  } else if (remaining <= STOCK_LOW_THRESHOLD){
    badge.textContent = TRANSLATIONS.stock_low[lang].replace("{n}", remaining);
    badge.classList.add("stock-low");
    addBtn.disabled = false;
  } else {
    badge.textContent = TRANSLATIONS.stock_in[lang];
    badge.classList.add("stock-in");
    addBtn.disabled = false;
  }
}

function refreshAllStockDisplays(){
  document.querySelectorAll(".product-card").forEach(updateStockDisplay);
}

function initShopProductCards(){
  document.querySelectorAll(".product-card").forEach(card => {
    const productId = card.dataset.product;
    const addBtn = card.querySelector(".product-add");
    if (!addBtn) return;

    card.querySelectorAll('input[type="radio"]').forEach(input => {
      input.addEventListener("change", () => updateStockDisplay(card));
    });
    updateStockDisplay(card);

    addBtn.addEventListener("click", () => {
      if (!SHOP_OPEN && productId !== "giftcard") return;

      const { size, color } = getSelectedVariant(card, productId);
      if (productId !== "giftcard"){
        const remaining = getStockRemaining(productId, size, color);
        if (remaining <= 0){
          updateStockDisplay(card);
          return;
        }
      }

      addToCart(productId, size, color, 1);
      updateStockDisplay(card);

      const lang = getCurrentLang();
      const original = TRANSLATIONS.shop_add_cart[lang];
      addBtn.textContent = TRANSLATIONS.shop_added[lang];
      addBtn.classList.add("is-added");
      setTimeout(() => {
        if (!addBtn.disabled) addBtn.textContent = original;
        addBtn.classList.remove("is-added");
      }, 1400);

      openCartDrawer();
    });
  });
}

const COOKIE_CONSENT_KEY = "rent2ride_cookie_consent";

function initVideoParallax(){
  const video = document.querySelector(".hero-video-bg");
  const section = document.querySelector(".hero-video-section");
  if (!video || !section) return;

  video.addEventListener("error", () => { video.style.display = "none"; }, true);
  if (video.readyState === 0 && video.networkState === 3){
    video.style.display = "none";
  }

  if (window.matchMedia("(max-width: 900px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ticking = false;
  function update(){
    const rect = section.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight){
      const offset = rect.top * 0.25;
      video.style.transform = `translateY(${-offset}px) scale(1.15)`;
    }
    ticking = false;
  }
  window.addEventListener("scroll", () => {
    if (!ticking){
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  update();
}

function initBikeGalleries(){
  document.querySelectorAll(".bike-card").forEach(card => {
    const mainImg = card.querySelector(".bike-main-img");
    const thumbs = card.querySelectorAll(".bike-thumb");
    if (!mainImg || !thumbs.length) return;
    thumbs.forEach(thumb => {
      thumb.addEventListener("click", () => {
        mainImg.src = thumb.dataset.img;
        thumbs.forEach(t => t.classList.remove("is-active"));
        thumb.classList.add("is-active");
      });
    });
  });
}

function initHeroCarousel(){
  const slides = document.querySelectorAll("#heroCarousel .hero-slide");
  if (!slides.length) return;
  let current = 0;
  setInterval(() => {
    slides[current].classList.remove("is-active");
    current = (current + 1) % slides.length;
    slides[current].classList.add("is-active");
  }, 5000);
}

function initRidePlanner(){
  const checkboxes = document.querySelectorAll(".ride-plan-input");
  const bar = document.getElementById("ridePlannerBar");
  if (!checkboxes.length || !bar) return;

  const countEl = document.getElementById("plannerCount");
  const kmEl = document.getElementById("plannerKm");
  const daysEl = document.getElementById("plannerDays");
  const HOURS_PER_DAY = 4.5;

  function render(){
    let totalKm = 0, totalHours = 0, count = 0;
    checkboxes.forEach(cb => {
      if (!cb.checked) return;
      const card = cb.closest(".ride-card");
      totalKm += parseFloat(card.dataset.km || 0);
      totalHours += parseFloat(card.dataset.hours || 0);
      count++;
    });
    countEl.textContent = count;
    kmEl.textContent = `${totalKm} km`;
    daysEl.textContent = Math.max(1, Math.ceil(totalHours / HOURS_PER_DAY));
    bar.classList.toggle("is-visible", count > 0);
  }

  checkboxes.forEach(cb => cb.addEventListener("change", render));
  render();
}

function initReferralTool(){
  const btn = document.getElementById("referralGenerate");
  const nameInput = document.getElementById("referralName");
  const result = document.getElementById("referralResult");
  const messageBox = document.getElementById("referralMessage");
  const copyBtn = document.getElementById("referralCopy");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    const lang = getCurrentLang();
    const templates = {
      fr: `${name ? name + " t'invite" : "Je t'invite"} à découvrir Rent2Ride, location de motos sur la Costa del Sol ! Avec le code PARRAIN15, tu as 15% de réduction sur ta première location. Infos et réservation : `,
      es: `${name ? name + " te invita" : "Te invito"} a descubrir Rent2Ride, alquiler de motos en la Costa del Sol! Con el código PARRAIN15 tienes un 15% de descuento en tu primer alquiler. Info y reserva: `,
      en: `${name ? name + " invites you" : "I'm inviting you"} to check out Rent2Ride, motorcycle rental on the Costa del Sol! Use code PARRAIN15 for 15% off your first rental. Info and booking: `,
    };
    const url = window.location.origin + window.location.pathname.replace(/offres\.html$/, "index.html");
    messageBox.value = templates[lang] + url;
    result.style.display = "block";
  });

  if (copyBtn){
    copyBtn.addEventListener("click", () => {
      messageBox.select();
      navigator.clipboard?.writeText(messageBox.value).catch(() => {});
      const lang = getCurrentLang();
      const original = copyBtn.textContent;
      copyBtn.textContent = TRANSLATIONS.referral_copied[lang];
      setTimeout(() => { copyBtn.textContent = original; }, 1500);
    });
  }
}

const WEATHER_API_KEY = "d1e8dd02ae4676330f60c4067310e5b7";
const WEATHER_CITY = "Malaga,ES";

function initWeatherWidget(){
  const widget = document.getElementById("weatherWidget");
  if (!widget || !WEATHER_API_KEY) return;

  fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(WEATHER_CITY)}&units=metric&appid=${WEATHER_API_KEY}`)
    .then(res => res.ok ? res.json() : Promise.reject(res.status))
    .then(data => {
      const temp = Math.round(data.main.temp);
      const code = data.weather[0].main;
      const icons = { Clear: "☀️", Clouds: "☁️", Rain: "🌧️", Drizzle: "🌦️", Thunderstorm: "⛈️", Snow: "❄️", Mist: "🌫️", Fog: "🌫️", Haze: "🌫️" };
      document.getElementById("weatherIcon").textContent = icons[code] || "☀️";
      document.getElementById("weatherTemp").textContent = `${temp}°C`;
      widget.style.display = "flex";
    })
    .catch(() => { widget.style.display = "none"; });
}

const STANDARD_HOURS = { start: 9, end: 20 };
const OFF_HOURS_FEE = 20;

function populateTimeSelect(selectEl, lang){
  if (!selectEl || selectEl.dataset.populated) return;
  selectEl.innerHTML = "";
  for (let h = STANDARD_HOURS.start; h <= STANDARD_HOURS.end; h++){
    const label = `${String(h).padStart(2, "0")}:00`;
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    if (h === 10) opt.selected = true;
    selectEl.appendChild(opt);
  }
  const offOpt = document.createElement("option");
  offOpt.value = "off-hours";
  offOpt.textContent = TRANSLATIONS.form_off_hours_option[lang];
  selectEl.appendChild(offOpt);
  selectEl.dataset.populated = "true";
}

function initBookingTimeSlots(){
  const pickupSelect = document.getElementById("pickupTime");
  const returnSelect = document.getElementById("returnTime");
  if (!pickupSelect || !returnSelect) return;
  const lang = getCurrentLang();
  populateTimeSelect(pickupSelect, lang);
  populateTimeSelect(returnSelect, lang);
  [pickupSelect, returnSelect].forEach(sel => sel.addEventListener("change", updateBookingSummary));
}

function initNewsletterForm(){
  document.querySelectorAll(".newsletter-form").forEach(form => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type='submit']");
      const successMsg = form.querySelector(".newsletter-success");
      const input = form.querySelector("input[type='email']");
      const originalBtnText = btn ? btn.textContent : "";
      if (btn) { btn.disabled = true; btn.textContent = "..."; }

      try {
        const res = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { "Accept": "application/json" }
        });
        if (res.ok) {
          if (successMsg) successMsg.style.display = "block";
          if (input) input.value = "";
        } else {
          alert("Une erreur est survenue, merci de réessayer.");
        }
      } catch (err) {
        alert("Une erreur est survenue, merci de réessayer.");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalBtnText; }
      }
    });
  });
}

function initCookieBanner(){
  const banner = document.getElementById("cookieBanner");
  if (!banner) return;
  if (localStorage.getItem(COOKIE_CONSENT_KEY)){
    banner.style.display = "none";
    return;
  }
  banner.style.display = "flex";
  const acceptBtn = document.getElementById("cookieAccept");
  if (acceptBtn){
    acceptBtn.addEventListener("click", () => {
      localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
      banner.style.display = "none";
    });
  }
}

function initCart(){
  const cartToggleBtns = document.querySelectorAll(".cart-toggle");
  cartToggleBtns.forEach(btn => btn.addEventListener("click", openCartDrawer));

  const closeBtn = document.getElementById("cartClose");
  if (closeBtn) closeBtn.addEventListener("click", closeCartDrawer);

  const overlay = document.getElementById("cartOverlay");
  if (overlay) overlay.addEventListener("click", closeCartDrawer);

  const checkoutBtn = document.getElementById("cartCheckoutBtn");
  if (checkoutBtn) checkoutBtn.addEventListener("click", openCheckoutPanel);

  const backBtn = document.getElementById("checkoutBackBtn");
  if (backBtn) backBtn.addEventListener("click", backToCartView);

  const sendBtn = document.getElementById("checkoutSendBtn");
  if (sendBtn) sendBtn.addEventListener("click", () => handleCheckoutSubmit());

  initShopProductCards();
  initProductGalleries();
  updateCartBadge();
}

// Gestion dynamique de la bannière des inclusions
function updateInclusBanner(lang) {
  const bannerImg = document.getElementById('inclusBanner');
  if (!bannerImg) return;
  
  if (lang === 'esp' || lang === 'es' || lang === 'ES') {
    bannerImg.src = './images/inclus-locations-banner-esp.jpg';
    bannerImg.alt = 'Incluido en todos los alquileres';
  } else if (lang === 'ang' || lang === 'en' || lang === 'EN') {
    bannerImg.src = './images/inclus-locations-banner-ang.jpg';
    bannerImg.alt = 'Included in all rentals';
  } else {
    bannerImg.src = './images/inclus-locations-banner-fr.jpg';
    bannerImg.alt = 'Inclus dans toutes les locations';
  }
}

/* BUG CORRIGÉ (26/08) : cette fonction était appelée à deux endroits
   (initLangSwitcher + setLang) mais n'avait jamais été écrite. La
   bannière Rent2Ride Club sur site-complet.html restait donc bloquée
   en français quelle que soit la langue choisie, sans aucune erreur
   visible dans la console (à cause du garde "typeof === function"). */
function updateClubBanner(lang) {
  const bannerImg = document.getElementById('clubBanner');
  if (!bannerImg) return;

  if (lang === 'esp' || lang === 'es' || lang === 'ES') {
    bannerImg.src = './images/rent2ride-club-banner-esp.jpg';
    bannerImg.alt = 'Motorista equipado Rent2Ride, pulgar arriba, en una carretera costera al atardecer — Rent2Ride Club';
  } else if (lang === 'ang' || lang === 'en' || lang === 'EN') {
    bannerImg.src = './images/rent2ride-club-banner-ang.jpg';
    bannerImg.alt = 'Rent2Ride rider giving a thumbs up on a coastal road at sunset — Rent2Ride Club';
  } else {
    bannerImg.src = './images/rent2ride-club-banner-fr.jpg';
    bannerImg.alt = 'Motard équipé Rent2Ride, pouce levé, sur une route côtière au coucher du soleil — Rent2Ride Club';
  }
}

// Initialisation globale au chargement du DOM
document.addEventListener("DOMContentLoaded", () => {
  initLangSwitcher();
  initMobileNav();
  initCalendarNav();
  renderCalendar();
  initBookingForm();
  initPromoCode();
  initBookingTimeSlots();
  initContactForm();
  syncDateInputs();
  initFaqAccordion();
  initGalleryLightbox();
  updateInclusBanner(getCurrentLang());
  initWhatsAppWidget();
  initMomovenLinks();
  initBikeGalleries();
  
  if (typeof updateClubBanner === "function") updateClubBanner(currentLang);
  updateInclusBanner(currentLang);

  refreshAvailabilityBadges();
  if (typeof updateAvailabilityCounter === "function") updateAvailabilityCounter();
  initCart();
  initPriceCalculator();
  initCookieBanner();
  initNewsletterForm();
  initHeroCarousel();
  initVideoParallax();
  initRidePlanner();
  initReferralTool();
  initWeatherWidget();
});

// Enregistrement du service worker
if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./js/sw.js", { scope: "./" }).catch(() => {});
  });
}