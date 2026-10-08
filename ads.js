/* AdSense only. No refresh, forced navigation, custom sticky ads or ad-click tracking. */
(function () {
  "use strict";
  if (window.FunSatAds) return;
  const cfg = window.FUNSAT_ADS || {};
  const dev = !((cfg.productionHosts || ["funsat.bid"]).includes(location.hostname));
  const preview = dev && new URLSearchParams(location.search).get("adpreview") === "1";
  const app = !!document.getElementById("screen-test");
  const slots = new WeakSet();
  // Editorial floor, not a Google word-count requirement. Support/legal and short
  // generated pages remain ad-free pending a publisher content-quality review.
  const content = document.querySelector(".gwrap, article, main")?.cloneNode(true);
  content?.querySelectorAll("script,style,nav,aside,.gfoot,.gfootnav,[data-ad-slot]").forEach(n => n.remove());
  const substantive = app || (!!content && content.textContent.trim().split(/\s+/).length >= 350 &&
    !/^\/(privacy|contact|about|corrections|methodology)(\/|$)/.test(location.pathname));
  let consent = false, practice = document.body.classList.contains("practice-test-active"), scriptPromise = null;
  const allowed = new Set(["home-sidebar", "results-top", "results-analysis", "college-list",
    "scholarships-list", "subjects-list", "article-mid", "article-bottom", "arcade-menu", "game-left", "game-right"]);
  const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.5) request(e.target);
  }, { rootMargin: "0px", threshold: 0.5 }) : null;

  function enabled() {
    return substantive && !dev && cfg.enabled === true && cfg.audienceReviewed === true && consent &&
      /^ca-pub-\d{16}$/.test(cfg.client || "") && (!app || cfg.autoAdsExclusionsConfirmed === true);
  }
  function specFor(host) {
    const raw = (cfg.slots || {})[host.dataset.adSlot];
    return typeof raw === "string" ? { id: raw } : (raw || {});
  }
  function blocked(host) {
    if (practice || !allowed.has(host.dataset.adSlot)) return true;
    if (host.dataset.adSlot.startsWith("game-") && host.dataset.safe !== "true") return true;
    if (host.dataset.adSlot === "results-analysis") {
      const review = document.getElementById("reviewArea");
      if (cfg.resultsDensity !== "moderate" || !review || review.style.display === "none" ||
          review.querySelectorAll(".review").length < 10) return true;
    }
    const overlay = document.getElementById("arcadeOverlay");
    if (host.dataset.adSlot === "arcade-menu" && document.getElementById("arcadeStage")?.classList.contains("active")) return true;
    return !!(overlay?.classList.contains("show") && !overlay.contains(host));
  }
  function load() {
    if (scriptPromise) return scriptPromise;
    // Adopt a pre-existing official loader rather than injecting a duplicate.
    scriptPromise = new Promise(resolve => {
      let script = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
      if (script) { resolve(true); return; }
      script = document.createElement("script");
      script.async = true; script.crossOrigin = "anonymous";
      script.dataset.funsatAdsense = "true";
      script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(cfg.client);
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => resolve(false), { once: true });
      document.head.appendChild(script);
    });
    return scriptPromise;
  }
  function visible(host) {
    const r = host.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && !host.hidden;
  }
  async function request(host) {
    if (slots.has(host) || blocked(host) || !visible(host) || (!preview && !enabled())) return;
    slots.add(host); observer?.unobserve(host);
    if (preview) {
      const mock = document.createElement("div"); mock.className = "ad-preview";
      mock.textContent = "Ad placement preview · " + host.dataset.adSlot;
      host.appendChild(mock); return;
    }
    const ok = await load();
    if (!ok) return;
    if (!enabled() || blocked(host) || !host.isConnected || !visible(host)) {
      // No unit has been requested yet. A later legitimate mount may try again.
      slots.delete(host); return;
    }
    const spec = specFor(host);
    const ad = document.createElement("ins"); ad.className = "adsbygoogle";
    ad.style.display = "block"; ad.dataset.adClient = cfg.client; ad.dataset.adSlot = spec.id;
    if (host.dataset.adSlot.startsWith("game-")) {
      ad.style.width = "160px"; ad.style.height = "600px";
    } else {
      ad.dataset.adFormat = "auto"; ad.dataset.fullWidthResponsive = "true";
    }
    host.appendChild(ad);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
    catch (_) { host.dataset.adFailed = "true"; }
    // Preserve reserved dimensions on failure/unfilled to avoid a second layout shift.
  }
  function mount() {
    document.querySelectorAll(".sponsor-slot[data-ad-slot]").forEach(host => {
      if (blocked(host)) return;
      const spec = specFor(host);
      if (!preview && (!enabled() || !/^\d+$/.test(spec.id || ""))) return;
      if (host.closest('[style*="display: none"], [style*="display:none"]')) return;
      if (host.dataset.adSlot.startsWith("game-") && host.dataset.safe !== "true") return;
      host.hidden = false;
      if (!host.dataset.adPrepared) {
        host.dataset.adPrepared = "true"; host.hidden = false;
        const label = document.createElement("span"); label.className = "sponsor-label";
        label.textContent = "Advertisement"; host.appendChild(label);
      }
      if (!slots.has(host)) { if (observer) observer.observe(host); else request(host); }
    });
    // Google controls Auto Ads on substantive content documents only.
    if (!app && enabled()) load();
  }
  function setPracticeMode(active) {
    practice = !!active;
    document.documentElement.classList.toggle("practice-test-active", practice);
    // Only manage our own hosts. Never hide/alter Google-generated ads or vignettes.
    const overlay = document.getElementById("arcadeOverlay");
    document.querySelectorAll(".sponsor-slot[data-ad-slot]").forEach(host => {
      host.hidden = practice || !host.dataset.adPrepared || blocked(host) ||
        !!(overlay?.classList.contains("show") && !overlay.contains(host));
    });
    if (!practice) mount();
  }
  function setConsent(granted) {
    // Call only from the publisher's certified CMP adapter, after its legal checks.
    consent = granted === true;
    if (consent) mount();
    else observer?.disconnect();
    // Once Google's script has loaded, withdrawal must be handled by the CMP;
    // this manager stops new requests and never manipulates delivered creatives.
  }
  function railSafety(bounds, ad, gap = 150) {
    return bounds.every(b => Math.hypot(Math.max(b.left - ad.right, ad.left - b.right, 0),
      Math.max(b.top - ad.bottom, ad.top - b.bottom, 0)) >= gap);
  }
  function layoutGameRails() {
    const overlay = document.getElementById("arcadeOverlay");
    const canvas = document.getElementById("gameCanvas");
    const rails = [...document.querySelectorAll('.sponsor-slot[data-ad-slot^="game-"]')];
    rails.forEach(h => { h.hidden = true; h.dataset.safe = "false"; });
    if (!overlay?.classList.contains("show") || !canvas || innerWidth < 1200 || practice ||
        document.querySelector(".drift-garage.show,.modal-overlay.show")) return;
    const cr = canvas.getBoundingClientRect();
    if (!cr.width || !cr.height || !document.getElementById("arcadeStage")?.classList.contains("active")) return;
    const controls = [...overlay.querySelectorAll('canvas,button,select,input,.dpad,.arcade-hud')]
      .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
    const top = Math.max(cr.top, (overlay.querySelector(".arcade-hud")?.getBoundingClientRect().bottom || 0) + 150);
    const origin = overlay.getBoundingClientRect();
    let count = 0;
    for (const host of rails) {
      const left = host.dataset.adSlot === "game-left" ? cr.left - 150 - 182 : cr.right + 150;
      const ad = { left, right: left + 182, top, bottom: top + 640 };
      if (count >= (cfg.gameRails === 2 ? 2 : cfg.gameRails === 0 ? 0 : 1) ||
          left < 16 || ad.right > innerWidth - 16 || !railSafety(controls, ad)) continue;
      host.style.left = (left - origin.left) + "px";
      host.style.top = (top - origin.top) + "px";
      host.dataset.safe = "true"; count++;
      if (host.dataset.adPrepared) host.hidden = false;
    }
    mount();
  }
  window.FunSatAds = { mount, setPracticeMode, setConsent, layoutGameRails, railSafety };
  window.addEventListener("resize", layoutGameRails);
  // Observe only control panels, never the per-frame HUD or Google ad DOM.
  if (typeof MutationObserver === "function") {
    const panels = new MutationObserver(layoutGameRails);
    for (const id of ["arcadeMsg", "washCustomize", "driftGarage", "authModal", "pauseModal"]) {
      const panel = document.getElementById(id);
      if (panel) panels.observe(panel, {attributes: true, attributeFilter: ["class", "style"], childList: true});
    }
  }
  window.addEventListener("funsat:ad-consent", e => setConsent(e.detail?.granted));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
