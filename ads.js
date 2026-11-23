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

  // Adsterra units only (sidebar skyscraper, phone banner and the native banner). No popunder or
  // social bar: this site is student-facing, so nothing may open unvetted third-party pages
  // without a deliberate click on the ad itself.
  //
  // EVERY third-party ad script runs inside a sandboxed iframe (no allow-same-origin, no
  // allow-top-navigation). That is what guarantees an ad only ever reacts to a click on the ad:
  // a script in the page itself could listen to every click on the site (and open tabs from
  // them); a script in a sandboxed frame cannot see our page, our clicks or our DOM at all.
  // Units are production-only, so local previews and test runs never fire real ad traffic.
  // Display units write their container with document.write, which is why they live in frames
  // anyway. The native widget fills a container in its own frame; a small script of ours in that
  // frame (frameReporter) reports its height and runs the family-safe text filter, because the
  // page cannot read into the frame.
  const ADSTERRA = config.units || {};
  const AD_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
  let rotateIndex = 0;
  const adFrames = [];
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
    frame.setAttribute("sandbox", AD_SANDBOX);
    frame.style.cssText = "display:block;border:0;width:" + width + "px;height:" + height + "px;max-width:100%;margin:0 auto;background:transparent";
    const atOptions = JSON.stringify({ key: String(unit.key || ""), format: "iframe", height: height, width: width, params: {} }).replace(/</g, "\\u003c");
    const src = String(unit.script).replace(/"/g, "%22");
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:transparent}</style></head><body>' +
      "<script>atOptions=" + atOptions + ";<\/script>" +
      '<script src="' + src + '"><\/script>' + reporterTag(null) + "</body></html>";
    adFrames.push(frame);
    return frame;
  }

  // Runs INSIDE an ad frame (stringified into its srcdoc, so it must not use anything from this file).
  // Reports whether the ad has filled (and a native widget's height), and clears the frame and says so if it ever
  // shows a listing that fails the family-safe filter. cfg.cid names the widget's container; null means "the whole body".
  function frameReporter(cfg) {
    var FLIRTY = new RegExp(cfg.flirty, "i"), BLOCKED = new RegExp(cfg.blocked, "i");
    var box = cfg.cid ? document.getElementById(cfg.cid) : document.body, lastHeight = -1, dead = false;
    function post(message) { try { parent.postMessage({ funsatAd: message }, "*"); } catch (e) {} }
    function ownText(node) { var p = node.parentNode; return p && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName); }
    function unsafe() {
      if (!box) return false;
      var walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null), node;
      while ((node = walker.nextNode())) { if (ownText(node)) continue; if (FLIRTY.test((node.textContent || "").slice(0, 240))) return true; }
      var els = box.querySelectorAll("img, a, iframe");
      for (var i = 0; i < els.length; i++) {
        var el = els[i], tag = el.tagName;
        if (tag === "IMG" && (FLIRTY.test(el.alt || "") || BLOCKED.test(el.src || ""))) return true;
        if (tag === "A" && (FLIRTY.test((el.textContent || "").slice(0, 240)) || BLOCKED.test(el.href || ""))) return true;
        if (tag === "IFRAME" && BLOCKED.test(el.src || "")) return true;
      }
      return false;
    }
    function measure() {
      if (!box) return 0;
      if (cfg.cid) return Math.ceil(box.getBoundingClientRect().height);
      var h = 0, kids = document.body.children;
      for (var i = 0; i < kids.length; i++) { if (/^(SCRIPT|STYLE)$/.test(kids[i].tagName)) continue; h = Math.max(h, Math.ceil(kids[i].getBoundingClientRect().bottom)); }
      return h;
    }
    function report() {
      if (dead) return;
      if (unsafe()) { dead = true; if (box) box.textContent = ""; post({ unsafe: true }); return; }
      var height = measure();
      if (height !== lastHeight) { lastHeight = height; post({ height: height }); }
    }
    new MutationObserver(report).observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    [300, 1000, 2500, 6000, 12000].forEach(function (ms) { setTimeout(report, ms); });
    window.addEventListener("load", report);
  }

  function reporterTag(cid) {
    const code = "(" + frameReporter.toString() + ")(" + JSON.stringify({ cid, flirty: FLIRTY.source, blocked: BLOCKED_HOSTS.source }) + ");";
    return "<script>" + code.replace(/<\//g, "<\\/") + "<\/script>";
  }

  function nativeFrame(unit) {
    const frame = document.createElement("iframe");
    frame.title = "Sponsored";
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("sandbox", AD_SANDBOX);
    frame.dataset.funsatNative = "true";
    frame.style.cssText = "display:block;border:0;width:100%;height:0;max-width:100%;margin:0 auto;background:transparent";
    const cid = String(unit.container).replace(/[^\w-]/g, "");
    const src = String(unit.script).replace(/"/g, "%22");
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:transparent}</style></head><body>' +
      '<script async data-cfasync="false" src="' + src + '"><\/script><div id="' + cid + '"></div>' + reporterTag(cid) + "</body></html>";
    adFrames.push(frame);
    return frame;
  }

  // Messages from ad frames: "filled" (and a native widget's height) or "unsafe" (the family-safe filter tripped inside it).
  // Only a frame we created is believed, and the height is clamped.
  window.addEventListener("message", (event) => {
    const data = event.data && event.data.funsatAd;
    if (!data || typeof data !== "object") return;
    const frame = adFrames.find((f) => f.contentWindow === event.source);
    if (!frame) return;
    const host = frame.closest("[data-ad-slot]");
    if (data.unsafe === true) { try { console.info("[funsat ads] hid a listing that failed the family-safe filter"); } catch (error) {} frame.remove(); if (host) { host.hidden = true; host.dataset.adState = "blocked"; pending.delete(host); } return; }
    const height = Math.max(0, Math.min(600, Math.floor(Number(data.height) || 0)));
    if (frame.dataset.funsatNative) frame.style.height = height + "px";
    frame.dataset.adHeight = String(height);
    if (host && height > (frame.dataset.funsatNative ? 24 : 8)) markFilled(host);
  });

  function renderAdsterra(host, rawSpec) {
    const spec = resolveSpec(rawSpec);
    // In-page units are production-only for the same reason as the AdSense
    // loader this replaced: local pages, previews, and headless tests must
    // never request live ad traffic or execute third-party ad scripts.
    if (location.hostname !== "funsat.bid") return false;
    if (spec.kind === "native" && ADSTERRA.native && ADSTERRA.native.script && ADSTERRA.native.container) {
      host.appendChild(nativeFrame(ADSTERRA.native));
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
    "article-mid": [320, 50, "Phone banner 320x50"],
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
    "article-grid": [300, 250, "Grid square 300x250"],
    "article-rail": [160, 600, "Margin rail 160x600"],
    "app-rail": [160, 600, "App rail 160x600"],
    "results-mobile": [320, 50, "Phone banner 320x50"],
    "college-mobile": [320, 50, "Phone banner 320x50"],
    "scholarships-mobile": [320, 50, "Phone banner 320x50"],
    "subjects-mobile": [320, 50, "Phone banner 320x50"],
    "article-bottom": [320, 50, "Phone banner 320x50"]
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

  // ---- When an ad may load, and when it may appear ----------------------------------------------------------------
  // An ad that pops into the layout while you are about to click something moves that thing under your cursor, and the
  // click lands on the ad. So a slot goes through three steps:
  //   1. LOAD: only when it is within about a screen of the viewport (or is a fixed side rail), so far-off units
  //      are not requested at all.
  //   2. HIDDEN: while loading it has no height, margin or border (class "is-loading"), so a unit that never fills
  //      takes no space and leaves no empty box. The ad frame itself is laid out at full size, so it still renders.
  //   3. SHOW: once filled, and only when showing it cannot move anything you are looking at. That is: it is a fixed
  //      side rail; or nothing clickable follows it on the screen; or it is still off-screen below; or you have not
  //      touched the page for a moment. Never while a dialog is open.
  let lastInput = 0;
  ["pointermove", "pointerdown", "touchstart", "touchmove", "keydown", "wheel", "scroll"].forEach((type) =>
    window.addEventListener(type, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  const pending = new Set();
  const INTERACTIVE = "a[href],button,input,select,textarea,summary,[role=button],[tabindex]:not([tabindex='-1'])";

  function isFixedSlot(host) { try { return getComputedStyle(host).position === "fixed"; } catch (error) { return false; } }

  // Where the slot sits (or would sit) in the viewport, even before it has a layout box of its own.
  function slotTop(host) {
    if (host.getClientRects().length) return host.getBoundingClientRect().top;
    let node = host.previousElementSibling;
    while (node) { if (node.getClientRects().length) return node.getBoundingClientRect().bottom; node = node.previousElementSibling; }
    const parent = host.parentElement;
    return parent ? parent.getBoundingClientRect().top : 0;
  }

  function controlsAfter(host) {
    const scope = host.closest("section, main, article, .gwrap") || document.body;
    return Array.from(scope.querySelectorAll(INTERACTIVE)).some((el) =>
      !host.contains(el) && (host.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && el.getClientRects().length && !el.closest("[hidden]"));
  }

  const canLoad = (host) => isFixedSlot(host) || slotTop(host) - window.innerHeight < 1200;

  const inFixedBar = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "fixed" || p === "sticky") return true; } return false; };

  // A side rail follows the reader down the page, so it needs a column to itself: nothing clickable and no text may share its
  // horizontal span (with 16px to spare) at ANY scroll position. On a page whose content is too wide for the window the rail
  // simply does not appear; the page's in-content unit is still there.
  function railIsClear(host) {
    const now = Date.now();
    if (host._railCheck && now - host._railCheck.at < 2000) return host._railCheck.clear;
    const r = host.getBoundingClientRect();
    let clear = r.width > 0;
    if (clear) {
      const left = r.left - 16, right = r.right + 16;
      clear = !Array.from(document.querySelectorAll(INTERACTIVE + ",p,h1,h2,h3,li,table,img,figure")).some((el) => {
        if (host.contains(el) || !el.getClientRects().length || el.closest("[hidden]") || inFixedBar(el)) return false;
        const b = el.getBoundingClientRect();
        return b.width > 4 && b.right > left && b.left < right;
      });
    }
    host._railCheck = { at: now, clear };
    return clear;
  }

  function canShow(host) {
    if (document.querySelector(".modal-overlay.show")) return false;
    if (isFixedSlot(host)) return railIsClear(host);
    if (!controlsAfter(host)) return true;
    if (slotTop(host) - window.innerHeight >= 100) return true;
    return Date.now() - lastInput > 1500;
  }

  function reveal(host) {
    host.classList.remove("is-loading");
    host.dataset.adState = "shown";
    pending.delete(host);
  }

  function markFilled(host) {
    if (!host || host.dataset.adState === "shown" || host.dataset.adState === "blocked") return;
    if (host.hidden && host.dataset.adEmpty) { host.hidden = false; delete host.dataset.adEmpty; }
    host.dataset.adState = "ready";
    if (canShow(host)) reveal(host); else { host._pendingSince = Date.now(); pending.add(host); armTick(); }
  }

  let tickTimer = 0;
  function armTick() { if (!tickTimer) tickTimer = setInterval(tick, 400); }
  function tick() {
    pending.forEach((host) => { if (!host.isConnected || Date.now() - (host._pendingSince || 0) > 120000) pending.delete(host); else if (canShow(host)) reveal(host); });
    if (!pending.size) { clearInterval(tickTimer); tickTimer = 0; }
  }

  function mount() {
    document.querySelectorAll("[data-ad-slot]").forEach((host) => {
      if (host.dataset.adMounted) return;
      const name = host.dataset.adSlot;
      const isAnchor = host.classList.contains("sponsor-anchor");
      if (isAnchor && anchorDismissed()) { host.remove(); return; }
      // Margin units only mount where the margin exists, so a narrow window never loads
      // (and never bills) an impression nobody can see. A later resize mounts them.
      if (host.dataset.maxWidth && window.innerWidth >= Number(host.dataset.maxWidth)) return;
      if (host.dataset.minWidth && window.innerWidth < Number(host.dataset.minWidth)) return;
      // Every app screen starts display:none. An adsbygoogle unit pushed while its
      // container is hidden measures zero width, comes back unfilled and does not
      // retry, so leave the slot unmounted until its screen is actually laid out.
      // showScreen calls mount() again on each switch. The slot itself is always
      // display:none at this point (it ships hidden), so the container is what
      // gets measured.
      const box = host.parentElement;
      if (box && !box.offsetWidth && !box.getClientRects().length) return;
      // An app screen's slot follows its (initially empty) body container; wait until that has rendered, so the slot is
      // judged by where it really sits.
      let before = host.previousElementSibling;
      while (before && before.hasAttribute("data-ad-slot")) before = before.previousElementSibling;
      if (before && /Body$/.test(before.id || "") && before.offsetHeight < 40) return;
      if (!canLoad(host)) return;
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
      if (!rendered) { host.hidden = true; if (isAnchor) host.remove(); return; }
      if (rendered && isAnchor) addAnchorDismiss(host);
      host.hidden = false;
      host.classList.add("is-loading");
      host.dataset.adState = "loading";
      // Networks that report back (our frames) call markFilled themselves. Direct creatives, previews and AdSense have
      // nothing to wait for. A unit that has not filled after 30 seconds is taken out of the page entirely.
      if (PREVIEW || config.provider !== "adsterra") markFilled(host);
      else setTimeout(() => { if (host.isConnected && host.dataset.adState === "loading") { host.hidden = true; host.dataset.adEmpty = "true"; } }, 30000);
      // After the hidden state is final, or a synchronous block would be overwritten by the show above.
      if (!PREVIEW) watchForUnsafeListings(host);
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

  let resizeTimer = 0;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { mount(); if (pending.size) { pending.forEach((h) => { h._railCheck = null; }); tick(); } }, 250); });
  let scrollTimer = 0;
  window.addEventListener("scroll", () => { if (scrollTimer) return; scrollTimer = setTimeout(() => { scrollTimer = 0; mount(); if (pending.size) tick(); }, 200); }, { passive: true });

  window.FunSatAds = { mount, setPracticeMode };
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    window.FunSatAds.__test = { elementIsUnsafe, creativeIsUnsafe, sweepContainer, watchForUnsafeListings, urlIsUnsafe };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  let mountSoon = 0;
  new MutationObserver(() => {
    if (document.body && document.body.classList.contains("practice-test-active")) setPracticeMode(true);
    // A screen that has just rendered its content may now have a slot worth loading.
    if (!mountSoon) mountSoon = setTimeout(() => { mountSoon = 0; mount(); }, 600);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
