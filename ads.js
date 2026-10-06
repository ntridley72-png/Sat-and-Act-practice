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

  function renderAdSense(host, slotId) {
    if (!config.client || !slotId) return false;
    loadAdSense();
    const ad = document.createElement("ins");
    ad.className = "adsbygoogle";
    ad.style.display = "block";
    ad.dataset.adClient = config.client;
    ad.dataset.adSlot = slotId;
    ad.dataset.adFormat = "auto";
    ad.dataset.fullWidthResponsive = "true";
    if (config.childDirected) ad.dataset.tagForChildDirectedTreatment = "1";
    host.appendChild(ad);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (error) {}
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
      const rendered = config.provider === "direct"
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
