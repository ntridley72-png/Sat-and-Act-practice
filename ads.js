/* Provider-neutral sponsor slots. No network ad code loads until configured. */
(function () {
  "use strict";
  const config = window.FUNSAT_ADS || { provider: "none", childDirected: true, slots: {} };

  function renderDirect(host, creative) {
    if (!creative || !creative.href || !creative.label) return false;
    if (creativeIsUnsafe(creative)) return false;
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

  // Adsterra in-page units only (sidebar skyscraper + native banner). No
  // popunder or social bar: this site is student-facing, so nothing may open
  // unvetted third-party pages without a deliberate click. Units are
  // production-only, exactly like the AdSense loader this replaced, so local
  // previews and test runs never fire real ad traffic. The native widget uses
  // one container that migrates to whichever ad slot is on screen (only one
  // instance may exist per page), and display units run inside a sandboxed
  // iframe because Adsterra's atOptions snippet writes its container with
  // document.write.
  const ADSTERRA = config.units || {};
  let rotateIndex = 0;
  let nativeHost = null, nativeOwner = null;
  function slotOnScreen(hostEl) {
    const box = hostEl && hostEl.parentElement;
    return !!(hostEl && hostEl.isConnected && box && (box.offsetWidth || box.getClientRects().length));
  }

  function resolveSpec(spec) {
    if (Array.isArray(spec)) { spec = spec[rotateIndex++ % spec.length]; return resolveSpec(spec); }
    if (spec && spec.unit && ADSTERRA[spec.unit]) return Object.assign({ kind: "iframe" }, ADSTERRA[spec.unit], spec);
    return spec || {};
  }

  function adFrame(unit) {
    const width = unit.width || 300;
    const height = unit.height || 250;
    const frame = document.createElement("iframe");
    frame.title = "Sponsored";
    frame.setAttribute("scrolling", "no");
    // srcdoc inherits the page origin, so the frame is sandboxed without
    // allow-same-origin: the ad script runs, the parent page stays opaque.
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox");
    frame.style.cssText = "display:block;border:0;width:" + width + "px;height:" + height + "px;max-width:100%;margin:0 auto;background:#0b0e14";
    const atOptions = JSON.stringify({ key: String(unit.key || ""), format: "iframe", height: height, width: width, params: {} }).replace(/</g, "\\u003c");
    const src = String(unit.script).replace(/"/g, "%22");
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:#0b0e14}</style></head><body>' +
      "<script>atOptions=" + atOptions + ";<\/script>" +
      '<script src="' + src + '"><\/script></body></html>';
    return frame;
  }

  function renderAdsterra(host, rawSpec) {
    const spec = resolveSpec(rawSpec);
    // In-page units are production-only for the same reason as the AdSense
    // loader this replaced: local pages, previews, and headless tests must
    // never request live ad traffic or execute third-party ad scripts.
    if (location.hostname !== "funsat.bid") return false;
    if (spec.kind === "native" && ADSTERRA.native && ADSTERRA.native.script && ADSTERRA.native.container) {
      // Only one native container may exist per page, and it belongs to the
      // slot that is actually on screen. If another screen already owns it,
      // leave this slot hidden and let a later mount retry once that owner
      // goes off screen (showScreen remounts on every switch).
      if (nativeOwner && nativeOwner !== host && slotOnScreen(nativeOwner)) { delete host.dataset.adMounted; return false; }
      if (!nativeHost) {
        nativeHost = document.createElement("div");
        nativeHost.id = ADSTERRA.native.container;
        nativeHost.style.cssText = "display:block;margin:0 auto;width:100%";
        const script = document.createElement("script");
        script.async = true;
        script.dataset.funsatAds = "native";
        script.src = ADSTERRA.native.script;
        document.body.appendChild(script);
      }
      if (nativeOwner && nativeOwner !== host) {
        nativeOwner.hidden = true;
        delete nativeOwner.dataset.adMounted;
        delete nativeOwner.dataset.adsterraNative;
      }
      host.appendChild(nativeHost);
      host.dataset.adsterraNative = "true";
      nativeOwner = host;
      return true;
    }
    if (spec.kind === "grid") {
      // 2x2 grid of square units. Needs at least two configured keys; a single
      // key would repeat one creative and read as broken, so the slot stays
      // hidden until the account has enough distinct units to rotate.
      const units = (ADSTERRA[spec.unitsFrom || "squares"] || []).filter((u) => u && u.script && u.key);
      if (units.length < 2) return false;
      host.classList.add("sponsor-grid");
      units.slice(0, 4).forEach((u) => {
        const cell = document.createElement("div");
        cell.className = "sponsor-grid-cell";
        cell.appendChild(adFrame(u));
        host.appendChild(cell);
      });
      return true;
    }
    if (spec.kind === "iframe" && spec.script) {
      host.appendChild(adFrame(spec));
      return true;
    }
    return false;
  }

  // Preview-only placeholders. Opt in with ?adpreview=1 so real visitors never
  // see a mock ad: an empty-looking box reads as broken, and anything that
  // imitates an ad sitting beside live AdSense code is not worth the risk.
  const PREVIEW = /[?&]adpreview=1\b/.test(location.search);

  const PREVIEW_SIZES = {
    "home-sidebar": [300, 250, "Sidebar 300x250"],
    "article-top": [728, 250, "In-article (fluid)"],
    "article-bottom": [728, 280, "Responsive 728x280"],
    "article-mid": [728, 250, "In-article (fluid)"],
    "anchor": [728, 90, "Sticky anchor 728x90"],
    "results-top": [728, 250, "Results 728x250"],
    "college-list": [728, 250, "In-feed (fluid)"],
    "scholarships-list": [728, 250, "In-feed (fluid)"],
    "subjects-list": [728, 250, "In-feed (fluid)"],
    "arcade-menu": [300, 250, "Arcade menu 300x250"],
    "rail-left": [160, 600, "Left rail 160x600"],
    "rail-right": [160, 600, "Right rail 160x600"],
    "results-grid": [300, 250, "Grid square 300x250"],
    "college-grid": [300, 250, "Grid square 300x250"],
    "scholarships-grid": [300, 250, "Grid square 300x250"],
    "subjects-grid": [300, 250, "Grid square 300x250"],
    "article-grid": [300, 250, "Grid square 300x250"]
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

  // The sticky anchor is the one unit that follows the reader, so a dismissal has
  // to stick too. Session scope, not local: it clears on a new visit but never
  // nags within one. Storage can throw in private mode, so every access is guarded.
  const ANCHOR_DISMISSED = "funsat.anchorDismissed";

  function anchorDismissed() {
    try { return sessionStorage.getItem(ANCHOR_DISMISSED) === "1"; } catch (error) { return false; }
  }

  function addAnchorDismiss(host) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sponsor-dismiss";
    close.setAttribute("aria-label", "Close ad");
    close.textContent = "\u00d7";
    close.addEventListener("click", () => {
      host.remove();
      try { sessionStorage.setItem(ANCHOR_DISMISSED, "1"); } catch (error) {}
    });
    host.appendChild(close);
  }

  // Family-safe filter. The ad network's own category blocks (Dating, Adult)
  // are the primary defense and are configured in the Adsterra dashboard; this
  // scanner is the second line for anything injected into our own DOM (native
  // widget, direct creatives) and for link/image targets we can still read.
  // Sandboxed iframes are cross-origin by design, so their inner text cannot be
  // inspected — that is why the dashboard block matters.
  const FLIRTY = /\b(dating|flirt[a-z]*|hookup|hook-up|singles|milf|horny|webcam[s]?|camgirl[s]?|escort[a-z]*|sugar\s?(bab[a-z]*|daddy|mama)|naughty|xxx+|porn[a-z]*|sexy|lonely|she\s+is\s+waiting|waiting\s+for\s+you|wants?\s+to\s+meet|meet\s+(me|you|tonight|women|girls|singles|local)|near\s+you|no\s+strings|casual\s+(fun|dating|encounter)|come\s+(over|see\s+me)|bad\s+girl[s]?|onlyfans|nsfw|lingerie|fetish|booty|bdsm|adult\s?dating|local\s?(women|singles|girls)|hot\s?(girls|singles|women)|single\s?(girls|women|ladies|moms))\b/i;
  // URL-safe: matches the term only between non-letters, so "updating" and
  // "validating" are not blocked as "dating".
  const BLOCKED_HOSTS = /(^|[^a-z])(dating|flirt[a-z]*|hookup|escort[a-z]*|milf|xxx+|porn[a-z]*|camgirl[s]?|webcam[s]?)([^a-z]|$)/i;

  function urlIsUnsafe(url) { return BLOCKED_HOSTS.test(String(url || "")); }

  function elementIsUnsafe(el) {
    const tag = el.tagName;
    if (tag === "IMG") return FLIRTY.test(el.alt || "") || urlIsUnsafe(el.src);
    if (tag === "A") return FLIRTY.test((el.textContent || "").slice(0, 240)) || urlIsUnsafe(el.href);
    if (tag === "IFRAME") return urlIsUnsafe(el.src);
    return false;
  }

  function violateAd(container, host) {
    try { console.info("[funsat ads] hid a listing that failed the family-safe filter"); } catch (error) {}
    // Clear the whole creative, not just the offending line: partial ads look
    // broken, and the widget can refill on the next mount.
    container.textContent = "";
    if (host) host.hidden = true;
    return true;
  }

  function sweepContainer(container, host) {
    if (!container || !container.isConnected) return false;
    // Text is scanned as leaf text nodes only: reading textContent on a wrapper
    // would include every descendant and let one stray word nuke a whole unit.
    if (typeof document.createTreeWalker === "function" && typeof NodeFilter !== "undefined") {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      let node = walker.nextNode();
      while (node) {
        if (FLIRTY.test((node.textContent || "").slice(0, 240))) return violateAd(container, host);
        node = walker.nextNode();
      }
    }
    const els = container.querySelectorAll("img, a, iframe");
    for (const el of els) if (elementIsUnsafe(el)) return violateAd(container, host);
    return false;
  }

  function watchForUnsafeListings(host) {
    const container = host.querySelector('[id^="container-"]') || host.querySelector("div");
    if (!container) return;
    let stopped = false;
    const check = () => { if (!stopped && sweepContainer(container, host)) stopped = true; };
    check();
    // Ad widgets fill asynchronously, so keep checking after each fill wave.
    setTimeout(check, 1600);
    setTimeout(check, 4500);
    if (typeof MutationObserver === "function") {
      const mo = new MutationObserver(() => check());
      mo.observe(container, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 20000);
    }
  }

  function creativeIsUnsafe(creative) {
    if (!creative) return false;
    return FLIRTY.test(String(creative.label || "")) || FLIRTY.test(String(creative.alt || "")) || urlIsUnsafe(creative.href) || urlIsUnsafe(creative.image);
  }

  function mount() {
    document.querySelectorAll("[data-ad-slot]").forEach((host) => {
      if (host.dataset.adMounted) return;
      const name = host.dataset.adSlot;
      const isAnchor = host.classList.contains("sponsor-anchor");
      if (isAnchor && anchorDismissed()) { host.remove(); return; }
      // Every app screen starts display:none. An adsbygoogle unit pushed while its
      // container is hidden measures zero width, comes back unfilled and does not
      // retry, so leave the slot unmounted until its screen is actually laid out.
      // showScreen calls mount() again on each switch. The slot itself is always
      // display:none at this point (it ships hidden), so the container is what
      // gets measured.
      const box = host.parentElement;
      if (box && !box.offsetWidth && !box.getClientRects().length) return;
      host.dataset.adMounted = "true";
      const label = document.createElement("span");
      label.className = "sponsor-label";
      label.textContent = "Sponsored";
      host.appendChild(label);
      const rendered = PREVIEW
        ? renderPlaceholder(host, name)
        : config.provider === "direct"
          ? renderDirect(host, (config.slots || {})[name])
          : config.provider === "adsterra"
            ? renderAdsterra(host, (config.slots || {})[name])
            : config.provider === "adsense"
              ? renderAdSense(host, (config.slots || {})[name])
              : false;
      if (rendered && isAnchor) addAnchorDismiss(host);
      host.hidden = !rendered;
      // After the hidden state is final, or a synchronous block would be
      // overwritten by the show above.
      if (rendered && !PREVIEW) watchForUnsafeListings(host);
      // An unfilled anchor would otherwise hold a fixed strip of empty page.
      if (!rendered && isAnchor) host.remove();
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
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    window.FunSatAds.__test = { elementIsUnsafe, creativeIsUnsafe, sweepContainer, watchForUnsafeListings, urlIsUnsafe };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  new MutationObserver(() => {
    if (document.body && document.body.classList.contains("practice-test-active")) setPracticeMode(true);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
