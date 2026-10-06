/* Provider-neutral sponsor slots. No network ad code loads until configured. */
(function () {
  "use strict";
  const config = window.FUNSAT_ADS || { provider: "none", childDirected: true, slots: {} };

  function renderDirect(host, creative) {
    if (!creative || !creative.href || !creative.label) return false;
    const link = document.createElement("a");
    link.className = "sponsor-creative";
    link.href = creative.href;
    link.target = "_blank";
    link.rel = "sponsored noopener";
    if (creative.image) {
      const image = document.createElement("img");
      image.src = creative.image;
      image.alt = creative.alt || "";
      image.loading = "lazy";
      link.appendChild(image);
    }
    const copy = document.createElement("span");
    copy.textContent = creative.label;
    link.appendChild(copy);
    host.appendChild(link);
    return true;
  }

  function loadAdSense() {
    if (!config.client || location.hostname !== "funsat.bid" || document.querySelector("script[data-funsat-adsense]")) return;
    const script = document.createElement("script");
    script.async = true;
    script.dataset.funsatAdsense = "true";
    script.crossOrigin = "anonymous";
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(config.client);
    document.head.appendChild(script);
  }

  function renderAdSense(host, slot) {
    // A slot is either a bare unit id, or { id, format, layout } for units that
    // need a specific presentation (in-article units are fluid, not auto).
    const spec = typeof slot === "string" ? { id: slot } : (slot || {});
    const slotId = spec.id;
    if (!config.client || !slotId) return false;
    loadAdSense();
    const ad = document.createElement("ins");
    ad.className = "adsbygoogle";
    ad.style.display = "block";
    if (spec.layout === "in-article") ad.style.textAlign = "center";
    ad.dataset.adClient = config.client;
    ad.dataset.adSlot = slotId;
    ad.dataset.adFormat = spec.format || "auto";
    if (spec.layout) ad.dataset.adLayout = spec.layout;
    // full_width_responsive is meaningless for fluid units and Google warns on it.
    if (!spec.format || spec.format === "auto") ad.dataset.fullWidthResponsive = "true";
    if (config.childDirected) ad.dataset.tagForChildDirectedTreatment = "1";
    host.appendChild(ad);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (error) {}
    return true;
  }

  // Preview-only placeholders. Opt in with ?adpreview=1 so real visitors never
  // see a mock ad: an empty-looking box reads as broken, and anything that
  // imitates an ad sitting beside live AdSense code is not worth the risk.
  const PREVIEW = /[?&]adpreview=1\b/.test(location.search);

  const PREVIEW_SIZES = {
    "home-sidebar": [300, 250, "Sidebar 300x250"],
    "article-top": [728, 250, "In-article (fluid)"],
    "article-bottom": [728, 280, "Responsive 728x280"]
  };

  function renderPlaceholder(host, name) {
    const [w, h, caption] = PREVIEW_SIZES[name] || [728, 250, name];
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<rect width="100%" height="100%" fill="#e8eaed" stroke="#9aa0a6" stroke-width="2" stroke-dasharray="10 7"/>' +
      '<text x="50%" y="46%" fill="#5f6368" font-family="system-ui,sans-serif" font-size="' + Math.round(h / 9) +
      '" font-weight="700" text-anchor="middle">Ad placeholder</text>' +
      '<text x="50%" y="63%" fill="#80868b" font-family="system-ui,sans-serif" font-size="' + Math.round(h / 14) +
      '" text-anchor="middle">' + caption + '</text></svg>';
    const img = document.createElement("img");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    img.alt = "";
    img.style.cssText = "display:block;width:100%;max-width:" + w + "px;height:auto;margin:0 auto";
    host.appendChild(img);
    return true;
  }

  function mount() {
    document.querySelectorAll("[data-ad-slot]").forEach((host) => {
      if (host.dataset.adMounted) return;
      host.dataset.adMounted = "true";
      const name = host.dataset.adSlot;
      const label = document.createElement("span");
      label.className = "sponsor-label";
      label.textContent = "Sponsored";
      host.appendChild(label);
      const rendered = PREVIEW
        ? renderPlaceholder(host, name)
        : config.provider === "direct"
          ? renderDirect(host, (config.slots || {})[name])
          : config.provider === "adsense"
            ? renderAdSense(host, (config.slots || {})[name])
            : false;
      host.hidden = !rendered;
    });
  }

  function setPracticeMode(active) {
    document.documentElement.classList.toggle("practice-test-active", !!active);
    document.querySelectorAll("[data-ad-slot], ins.adsbygoogle, .google-auto-placed, #google_vignette").forEach((node) => {
      if (active) {
        if (!node.hasAttribute("data-practice-ad-hidden")) node.dataset.practiceAdDisplay = node.style.display || "";
        node.setAttribute("data-practice-ad-hidden", "true");
        node.style.setProperty("display", "none", "important");
      } else if (node.hasAttribute("data-practice-ad-hidden")) {
        node.removeAttribute("data-practice-ad-hidden");
        node.style.display = node.dataset.practiceAdDisplay || "";
        delete node.dataset.practiceAdDisplay;
      }
    });
  }

  window.FunSatAds = { mount, setPracticeMode };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  new MutationObserver(() => {
    if (document.body && document.body.classList.contains("practice-test-active")) setPracticeMode(true);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
