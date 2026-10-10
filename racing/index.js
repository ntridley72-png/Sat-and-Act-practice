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

  /* Load the app bundle. Resolves with its module (which exports mount and
     unmount), or rejects. Deliberately does NOT mount: the caller decides
     when React takes over the canvas. */
  function loadApp() {
    if (appModule) return Promise.resolve(appModule);
    if (appLoading) return appLoading;
    var url = appBase() + APP_ENTRY;
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
    appLoaded: function () { return !!appModule; },
    source: function () {
      if (fromQuery() !== null) return "query";
      if (fromStorage() !== null) return "device";
      if (fromProfile() !== null) return "account";
      return "default";
    }
  };
})();
