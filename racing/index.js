/* Racing v2 entry point and feature flag.
 *
 * The v2 simulation ships alongside the original DriftCircuit/NeonRacing code
 * rather than replacing it. `racingV2` decides which one runs, and it defaults
 * OFF: a student loading the page gets exactly the game they had yesterday
 * unless the flag is turned on for them.
 *
 * Flag precedence, highest first:
 *   1. ?racingV2=1 / ?racingV2=0  — a link, for testing on a real device
 *   2. localStorage               — a per-device override, set by the toggle
 *   3. profile.flags.racingV2     — the account value, synced from the server
 *   4. off
 *
 * The v2 SIMULATION modules (core/, data/, game/) are loaded lazily and only
 * when the flag is on, so a student who never turns it on never downloads them.
 *
 * Note that `racing/` also holds two files that are NOT part of v2 and are
 * deliberately loaded unconditionally from the page: `session.js` (the free
 * practice and scored-run rules) and `workshop.js` (the garage UI). Both are
 * shipped, live features that drive the existing v1 game. They share this
 * directory for tidiness, not because they are behind the flag, and gating them
 * would withdraw working features from everyone. Only the module list in PARTS
 * is flag-controlled.
 */
(function () {
  "use strict";
  var KEY = "funsat.racingV2";
  var PARTS = ["core/random.js", "core/fixed-step.js", "core/vehicle-physics.js", "data/cars.js", "game/ghost.js", "game/ai.js"];

  function fromQuery() {
    try {
      var v = new URLSearchParams(location.search).get("racingV2");
      if (v === "1" || v === "true") return true;
      if (v === "0" || v === "false") return false;
    } catch (e) {}
    return null;
  }
  function fromStorage() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) {}
    return null;
  }
  function fromProfile() {
    try {
      if (typeof profile !== "undefined" && profile && profile.flags && typeof profile.flags.racingV2 === "boolean") {
        return profile.flags.racingV2;
      }
    } catch (e) {}
    return null;
  }

  function enabled() {
    var q = fromQuery(); if (q !== null) return q;
    var s = fromStorage(); if (s !== null) return s;
    var p = fromProfile(); if (p !== null) return p;
    return false;
  }

  /* Set the per-device override. Passing null clears it and falls back to the
     account value. */
  function setLocal(on) {
    try {
      if (on === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, on ? "1" : "0");
    } catch (e) {}
    return enabled();
  }

  var loading = null;
  function base() {
    var tag = document.querySelector('script[src*="racing/index.js"]');
    var src = tag && tag.getAttribute("src");
    return src ? src.replace(/index\.js(\?.*)?$/, "") : "racing/";
  }
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = url;
      el.async = false; // order matters: ghost.js and ai.js read the core
      el.onload = resolve;
      el.onerror = function () { reject(new Error("failed to load " + url)); };
      document.head.appendChild(el);
    });
  }

  /* Load the v2 modules. Resolves with the Racing namespace, or rejects. The
     caller is expected to fall back to v1 on rejection rather than show an
     error: a failed optional download must not cost the student their game. */
  function load() {
    if (window.Racing && window.Racing.Physics && window.Racing.AI) return Promise.resolve(window.Racing);
    if (loading) return loading;
    var root = base();
    loading = PARTS.reduce(function (chain, part) {
      return chain.then(function () { return loadScript(root + part); });
    }, Promise.resolve()).then(function () {
      if (!window.Racing || !window.Racing.Physics) throw new Error("racing v2 loaded but is incomplete");
      return window.Racing;
    }).catch(function (err) {
      loading = null;
      throw err;
    });
    return loading;
  }

  /* Load only if the flag is on. Resolves with null when it is off, so callers
     can write `if (!r) return v1()`. */
  function ensure() {
    if (!enabled()) return Promise.resolve(null);
    return load().catch(function (err) {
      try { console.warn("racing v2 unavailable, staying on v1:", err.message); } catch (e) {}
      return null;
    });
  }

  /* ---- v2 React app (the rebuilt 3D game) --------------------------------
   *
   * Separate from load()/ensure() above on purpose. Those load the vanilla v2
   * SIMULATION modules in PARTS and are asserted on by tests/racing-v2-flag.cjs,
   * which requires ensure() to return the Racing namespace and run a 120-tick
   * physics step. Repointing them at the React bundle would break that
   * contract, so the app gets its own pair and the vanilla path is untouched.
   *
   * The bundle is an ES module built by racing-v2/ and served at
   * /racing-v2/racing-v2.js. It is import()ed, never <script>-tagged, and
   * nothing here runs until ensureApp() is called -- which is what keeps
   * three.js and cannon off the wire for a student who never opens the game.
   */
  var APP_ENTRY = "racing-v2.js";
  var appLoading = null;
  var appModule = null;

  /* The app is a sibling of racing/, so derive its URL from the same script
     tag rather than hardcoding a root-absolute path. That keeps the game
     working if the site is ever served from a subdirectory. */
  function appBase() {
    var root = base();
    return /racing\/$/.test(root) ? root.replace(/racing\/$/, "racing-v2/") : "racing-v2/";
  }

  /* Absolute URL for the bundle.
   *
   * import() is NOT the same as a <script src>: a specifier without a leading
   * "./", "../" or "/" is treated as a bare MODULE specifier, not a relative
   * URL, and the browser rejects it outright --
   * "Failed to resolve module specifier 'racing-v2/racing-v2.js'". base()
   * returns exactly that shape, so resolving against the document here is
   * what makes the import work at all. */
  function appUrl() {
    var rel = appBase() + APP_ENTRY;
    try {
      return new URL(rel, document.baseURI || location.href).href;
    } catch (e) {
      // Last resort; at least make it document-relative rather than bare.
      return rel.charAt(0) === "/" ? rel : "./" + rel;
    }
  }

  /* Load the app bundle. Resolves with its module (which exports mount and
     unmount), or rejects. Deliberately does NOT mount: the caller decides
     when React takes over the canvas. */
  function loadApp() {
    if (appModule) return Promise.resolve(appModule);
    if (appLoading) return appLoading;
    var url = appUrl();
    /* A literal dynamic import, deliberately NOT new Function("return import(u)").
       The Function constructor would need 'unsafe-eval' in any future
       Content-Security-Policy: this site serves ads and adding a script-src
       policy is a normal hardening step, which would then silently break the
       game with no clue as to why. Dynamic import() has been supported by
       every browser since 2018, so the parse-error risk that would have
       justified the indirection no longer exists. */
    appLoading = Promise.resolve()
      .then(function () { return import(/* @vite-ignore */ url); })
      .then(function (mod) {
        if (!mod || typeof mod.mount !== "function") {
          throw new Error("racing v2 app loaded but exports no mount()");
        }
        appModule = mod;
        return mod;
      })
      .catch(function (err) {
        appLoading = null;
        throw err;
      });
    return appLoading;
  }

  /* Load the app only if the flag is on. Resolves null when it is off OR when
     the download failed, mirroring ensure() so every caller can keep writing
     `if (!app) return v1()`. A failed optional download must never cost a
     student their game, and must never throw into the page. */
  function ensureApp() {
    if (!enabled()) return Promise.resolve(null);
    return loadApp().catch(function (err) {
      try { console.warn("racing v2 app unavailable, staying on v1:", err.message); } catch (e) {}
      return null;
    });
  }

  /* The one call a host page should use.
   *
   * Everything that can go wrong with the optional game is funnelled here, so
   * a caller can write `if (!await RacingV2.startApp(el)) v1();` and be
   * certain it will never see an exception. Three failure modes are covered:
   *
   *   1. the flag is off, or the bundle fails to download  -> ensureApp()
   *   2. mount() throws synchronously (no WebGL, detached node)
   *   3. the React tree throws AFTER mounting (cannon worker, geometry)
   *
   * (3) is the one that needed real work: it happens after this promise would
   * already have resolved, so the module reports it through onError and the
   * host's onFail runs then. Without that path, a late WebGL failure left a
   * student staring at a blank canvas with their working game gone.
   */
  /* Does this device have WebGL at all.
   *
   * Mirrors racing3d.js:33, which v1 already checks before starting its own
   * 3D renderer. Checking BEFORE mounting is better than catching the throw
   * afterwards: on a device with no WebGL there is nothing to try, and
   * downloading ~380 KB of renderer to then fail is pure waste on exactly the
   * low-end hardware least able to afford it. */
  function webglSupported() {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) {
      return false;
    }
  }

  function startApp(container, opts) {
    var options = opts || {};
    if (!webglSupported()) {
      try { console.warn("racing v2 needs WebGL, staying on v1"); } catch (e) {}
      return Promise.resolve(false);
    }
    return ensureApp().then(function (mod) {
      if (!mod) return false;
      try {
        mod.mount(container, {
          opponents: options.opponents,
          seed: options.seed,
          // The host knows where the game was served from; the bundle cannot
          // reliably work it out, because Vite rewrites import.meta.url.
          assetBase: appBase(),
          onQuit: options.onQuit,
          onError: function () {
            try { mod.unmount(); } catch (e) {}
            try { if (typeof options.onFail === "function") options.onFail(); } catch (e) {}
          }
        });
        return true;
      } catch (err) {
        try { console.warn("racing v2 failed to start, staying on v1:", err && err.message); } catch (e) {}
        try { mod.unmount(); } catch (e) {}
        return false;
      }
    });
  }

  function stopApp() {
    if (!appModule) return;
    try { appModule.unmount(); } catch (e) {}
  }

  /* ---- arcade integration ------------------------------------------------
   *
   * Hooks the existing arcade rather than editing app.js, which is 12k lines
   * and carries unrelated uncommitted work. racing/index.js already loads on
   * every page view immediately after app.js, so `arcade` is defined by the
   * time this runs and wrapping its select() is the smallest possible seam.
   *
   * Everything here is fail-open. If the flag is off, if the arcade is not
   * where it is expected, if WebGL is missing, or if the bundle will not
   * load, the wrapper calls straight through to the original and the student
   * gets the v1 game exactly as before. The ONLY way v2 appears is if every
   * check passes.
   */
  var V2_GAMES = { drift: true, racing: true };
  var mountEl = null;
  var hooked = false;

  function ensureMount(stage) {
    if (mountEl && mountEl.isConnected) return mountEl;
    mountEl = document.createElement("div");
    mountEl.id = "racingV2Mount";
    mountEl.setAttribute("role", "application");
    mountEl.setAttribute("aria-label", "Racing game");
    // Fills the arcade stage and sits above the 2D canvas. Inline styles
    // rather than a class because racing.css belongs to v1 and this element
    // must not depend on it.
    mountEl.style.cssText = "position:absolute;inset:0;z-index:5;display:none;";
    stage.appendChild(mountEl);
    return mountEl;
  }

  function teardown(stage) {
    stopApp();
    if (mountEl) mountEl.style.display = "none";
    if (stage) stage.classList.remove("racing-v2-active");
  }

  function hookArcade() {
    if (hooked) return;
    /* `arcade` is a top-level const in app.js, so it is a global lexical
       binding reachable by bare name but NOT as window.arcade. typeof guards
       against both a missing binding and a load-order change. */
    if (typeof arcade === "undefined" || !arcade || typeof arcade.select !== "function") return;
    var stage = document.getElementById("arcadeStage");
    if (!stage) return;

    hooked = true;
    var originalSelect = arcade.select.bind(arcade);

    arcade.select = function (game) {
      // Not a driving game, or the flag is off: nothing changes, at all.
      if (!V2_GAMES[game] || !enabled()) {
        teardown(stage);
        return originalSelect(game);
      }

      // Open the overlay and clear any previous game the way select() would,
      // then try v2. If it declines, fall through to v1 in the same tick so
      // the student never sees a gap.
      var host = ensureMount(stage);
      host.style.display = "block";
      stage.classList.add("racing-v2-active");

      startApp(host, {
        opponents: 6,
        seed: "race-" + game,
        onFail: function () { teardown(stage); originalSelect(game); },
        onQuit: function () { teardown(stage); originalSelect(game); }
      }).then(function (started) {
        if (!started) {
          teardown(stage);
          originalSelect(game);
        }
      });
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", hookArcade, { once: true });
    } else {
      hookArcade();
    }
  }

  window.RacingV2 = {
    KEY: KEY,
    PARTS: PARTS,
    APP_ENTRY: APP_ENTRY,
    enabled: enabled,
    setLocal: setLocal,
    load: load,
    ensure: ensure,
    loadApp: loadApp,
    ensureApp: ensureApp,
    startApp: startApp,
    stopApp: stopApp,
    webglSupported: webglSupported,
    hookArcade: hookArcade,
    appLoaded: function () { return !!appModule; },
    source: function () {
      if (fromQuery() !== null) return "query";
      if (fromStorage() !== null) return "device";
      if (fromProfile() !== null) return "account";
      return "default";
    }
  };
})();
