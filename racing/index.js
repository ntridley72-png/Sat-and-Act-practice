/* Racing v2 entry point and feature flag.
 *
 * The rebuilt 3D game is the DEFAULT as of 2026-10-10 (operator decision):
 * a student who opens 'drift' or 'racing' in the arcade gets the v2 game.
 * Every explicit way back still wins, because a shipped default is exactly
 * the thing that needs escape hatches:
 *
 *   1. ?racingV2=0               — a link, for testing on a real device
 *   2. localStorage              — a per-device override (RacingV2.setLocal)
 *   3. profile.flags.racingV2    — the account value, synced from the server
 *   4. on                        — the default
 *
 * The original v1 game and its code remain fully present; a failure anywhere
 * in the v2 startup path falls through to v1 in the same tick, which the
 * browser tests assert. The v2 SIMULATION modules (core/, data/, game/) are
 * still loaded lazily -- nothing downloads them until a driving game is
 * actually opened.
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
    /* DEFAULT ON (operator decision, 2026-10-10): the new game is what
       students get. Every explicit signal above still wins -- ?racingV2=0 and
       RacingV2.setLocal(false) return the old game, and a startup failure
       falls through to v1 regardless of this value. */
    return true;
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

  /* ---- the v2 economy bridge ---------------------------------------------
   *
   * v2 is the game now, so the v1 session economy has to live on inside it:
   * one token per scored run, Open Practice free and unrecorded, records
   * banked in the profile. v1's session.js wrapped arcade.select(), but the
   * v2 path intercepts BEFORE that wrapper, so the rules come to v2 instead
   * through this bridge.
   *
   * Every method is try/guarded. This is the seam between a 12k-line vanilla
   * app and the React game, and no economy call may cost a student their race.
   */
  function ensureRecords() {
    if (!profile.racingV2Records || typeof profile.racingV2Records !== "object") profile.racingV2Records = {};
    return profile.racingV2Records;
  }
  function makeEconomy(initialMode) {
    /* Scored runs charged-but-not-refunded. The v1 fallback seam reads this so
       a mount that dies after the player already paid cannot double-charge. */
    var scoredCharges = 0;
    return {
      initialMode: initialMode === "scored" ? "scored" : "practice",
      tokenCost: 1,
      tokens: function () {
        try { return profile.tokens | 0; } catch (e) { return 0; }
      },
      spendScored: function () {
        try {
          if ((profile.tokens | 0) < 1) return false;
          profile.tokens = (profile.tokens | 0) - 1;
          scoredCharges++;
          saveProfile();
          updateHUD();
          return true;
        } catch (e) { return false; }
      },
      scoredCharges: function () { return scoredCharges; },
      refundScored: function () {
        try {
          profile.tokens = (profile.tokens | 0) + 1;
          scoredCharges = Math.max(0, scoredCharges - 1);
          saveProfile();
          updateHUD();
          return true;
        } catch (e) { return false; }
      },
      best: function (trackId, weather) {
        try { return ensureRecords()[trackId + ":" + weather] || null; } catch (e) { return null; }
      },
      record: function (trackId, weather, run) {
        try {
          var recs = ensureRecords();
          var key = trackId + ":" + weather;
          var prev = recs[key] || {};
          var entry = {
            race: typeof prev.race === "number" ? prev.race : null,
            raceAt: prev.raceAt || null,
            lap: typeof prev.lap === "number" ? prev.lap : null,
            lapAt: prev.lapAt || null,
            position: typeof prev.position === "number" ? prev.position : null,
          };
          var now = new Date().toISOString();
          var improvedRace = typeof run.race === "number" && (entry.race === null || run.race < entry.race);
          var improvedLap = typeof run.lap === "number" && (entry.lap === null || run.lap < entry.lap);
          if (improvedRace) { entry.race = run.race; entry.raceAt = now; entry.position = run.position; }
          if (improvedLap) { entry.lap = run.lap; entry.lapAt = now; }
          recs[key] = entry;
          saveProfile();
          return { entry: entry, improvedRace: improvedRace, improvedLap: improvedLap };
        } catch (e) {
          return { entry: null, improvedRace: false, improvedLap: false };
        }
      },
      toast: function (message) { try { showToast(message); } catch (e) {} },
    };
  }

  /* ---- the v2 garage bridge -----------------------------------------------
   *
   * The whole progression lives in profile.garage, owned by the v1 app and
   * shared with v1's workshop, so a car bought in v2 shows as owned in v1 and
   * a legacy garage keeps everything Cars.migrateUnlocks() maps forward.
   *
   * The roster itself comes from racing/data/cars.js -- one canonical file,
   * loaded lazily the first time the garage asks for it (a student who never
   * opens the game downloads nothing, and a student who opens it pays for one
   * small script). Display names and prices prefer DriftCircuit.CARS, which
   * is what the v1 shop shows today, so the two shops name the same car the
   * same way.
   */
  var V2_ARCHETYPES = {
    sport: "sport", hatch: "hatch", coupe90: "roadster", muscle: "muscle",
    rotary: "wedge", rally: "rally", track: "supercar", straight: "sport",
    hyper: "hyper", ev: "ev",
  };
  var rosterPromise = null;
  function loadCarRoster() {
    if (window.Racing && window.Racing.Cars && window.Racing.Cars.CARS) return Promise.resolve(window.Racing.Cars);
    if (rosterPromise) return rosterPromise;
    rosterPromise = loadScript(base() + "data/cars.js").then(function () {
      return (window.Racing && window.Racing.Cars) || null;
    }).catch(function () {
      rosterPromise = null;
      return null;
    });
    return rosterPromise;
  }
  function buildRoster(Cars) {
    var DC = (typeof DriftCircuit !== "undefined" && DriftCircuit.CARS) || {};
    return Cars.ORDER.map(function (id) {
      var c = Cars.CARS[id], dc = DC[id] || {};
      return {
        id: id,
        name: dc.name || c.name,
        price: typeof dc.price === "number" ? dc.price : (c.unlockPrice | 0),
        archetype: V2_ARCHETYPES[id] || "sport",
        starter: !!c.starter,
        mass: c.mass, drive: c.drive,
        gripFront: c.gripFront, gripRear: c.gripRear,
        torqueCurve: c.torqueCurve, handbrakeRelease: c.handbrakeRelease,
      };
    });
  }
  function makeGarage() {
    function g() {
      try { return DriftCircuit.garage(); } catch (e) { return null; }
    }
    return {
      cash: function () { try { return g().cash | 0; } catch (e) { return 0; } },
      tokens: function () { try { return profile.tokens | 0; } catch (e) { return 0; } },
      paintPalette: function () { try { return window.CAR_PAINTS || null; } catch (e) { return null; } },
      car: function () { try { return DriftCircuit.garage().raceCar; } catch (e) { return "sport"; } },
      tune: function () {
        try {
          var t = DriftCircuit.garage().tune;
          return { power: t.power, grip: t.grip, weight: t.weight, handbrake: t.handbrake };
        } catch (e) { return { power: 0.7, grip: 1.35, weight: 1.2, handbrake: 1 }; }
      },
      unlocked: function () {
        try {
          var garage = DriftCircuit.garage();
          var u = Array.isArray(garage.unlocked) ? garage.unlocked : [];
          /* Map legacy ids (panda, popup, wedge, ...) onto the launch records
             once, then persist -- migration is idempotent. */
          var migrated = (window.Racing && window.Racing.Cars) ? window.Racing.Cars.migrateUnlocks(u) : u;
          if (migrated.length !== u.length || migrated.some(function (id, i) { return id !== u[i]; })) {
            garage.unlocked = migrated;
            try { saveProfile(); } catch (e2) {}
          }
          return migrated;
        } catch (e) { return ["sport"]; }
      },
      roster: function () {
        return loadCarRoster().then(function (Cars) {
          if (!Cars || !Cars.CARS) return [];
          return buildRoster(Cars);
        });
      },
      buy: function (id) {
        try {
          var garage = DriftCircuit.garage();
          if ((garage.unlocked || []).indexOf(id) >= 0) return true;
          var Cars = window.Racing && window.Racing.Cars;
          var spec = Cars && Cars.CARS[id];
          var price = 0;
          try { price = (typeof DriftCircuit.CARS[id] !== "undefined") ? (DriftCircuit.CARS[id].price | 0) : (spec ? (spec.unlockPrice | 0) : 0); } catch (e3) { price = spec ? (spec.unlockPrice | 0) : 0; }
          if ((garage.cash | 0) < price) return false;
          garage.cash = (garage.cash | 0) - price;
          garage.unlocked = (garage.unlocked || []).concat([id]);
          saveProfile();
          updateHUD();
          try { showToast("Unlocked " + ((DriftCircuit.CARS[id] && DriftCircuit.CARS[id].name) || (spec && spec.name) || id) + "!"); } catch (e4) {}
          return true;
        } catch (e) { return false; }
      },
      migrate: function (id) {
        try {
          var Cars = window.Racing && window.Racing.Cars;
          return Cars ? Cars.migrateSelection(id) : "sport";
        } catch (e) { return "sport"; }
      },
      select: function (id) {
        try {
          var garage = DriftCircuit.garage();
          if ((garage.unlocked || []).indexOf(id) < 0) return;
          /* v2 has no separate drift mode, so the choice follows the student
             into the v1 drift game too rather than diverging silently. */
          garage.raceCar = id;
          garage.car = id;
          saveProfile();
        } catch (e) {}
      },
      setTune: function (patch) {
        try {
          var garage = DriftCircuit.garage();
          Object.keys(patch || {}).forEach(function (k) {
            if (typeof patch[k] !== "number" || !isFinite(patch[k])) return;
            /* Mirror of TUNE_RANGE in racing-v2/src/garage.ts. The slider
               already bounds this, but the bridge is the data layer, so it
               clamps instead of trusting the caller. */
            garage.tune[k] = Math.max(0.7, Math.min(1.4, patch[k]));
          });
          saveProfile();
        } catch (e) {}
      },
      addCash: function (amount) {
        try {
          var n = Math.max(0, Math.floor(amount) || 0);
          if (!n) return;
          var garage = DriftCircuit.garage();
          garage.cash = (garage.cash | 0) + n;
          saveProfile();
          updateHUD();
        } catch (e) {}
      },
      convertTokens: function (n) {
        try {
          var count = Math.max(0, Math.min(profile.tokens | 0, Math.floor(n) || 0));
          if (!count) return 0;
          profile.tokens = (profile.tokens | 0) - count;
          var cash = count * 250;
          var garage = DriftCircuit.garage();
          garage.cash = (garage.cash | 0) + cash;
          saveProfile();
          updateHUD();
          return cash;
        } catch (e) { return 0; }
      },
      /* Cosmetics and preferences. All shared with v1's workshop: a
         paint/finish/spoiler/neon/camera choice made in v2 is the choice
         v1 sees, and vice versa. Wings keep their one-time prices. */
      style: function () {
        try {
          var garage = DriftCircuit.garage();
          return { paint: garage.paint, finish: garage.finish, spoiler: garage.spoiler, neon: garage.neon };
        } catch (e) { return { paint: "teal", finish: "gloss", spoiler: "lip", neon: "none" }; }
      },
      wings: function () { try { return DriftCircuit.WINGS; } catch (e) { return { none: { name: "No wing", price: 0 }, lip: { name: "Lip", price: 0 } }; } },
      finishes: function () { try { return DriftCircuit.FINISHES; } catch (e) { return { gloss: "Gloss" }; } },
      ownedWings: function () { try { return DriftCircuit.garage().ownedWings || ["none", "lip"]; } catch (e) { return ["none", "lip"]; } },
      setStyle: function (patch) {
        try {
          var garage = DriftCircuit.garage();
          var p = patch || {};
          if (typeof p.paint === "string") garage.paint = p.paint;
          if (typeof p.finish === "string") garage.finish = p.finish;
          if (typeof p.neon === "string") garage.neon = p.neon;
          if (typeof p.spoiler === "string") {
            var wing = (DriftCircuit.WINGS || {})[p.spoiler];
            if (wing) {
              var owned = garage.ownedWings || (garage.ownedWings = []);
              if (owned.indexOf(p.spoiler) < 0) {
                var price = wing.price | 0;
                if ((garage.cash | 0) < price) return; // refused: nothing changes
                garage.cash = (garage.cash | 0) - price;
                owned.push(p.spoiler);
              }
              garage.spoiler = p.spoiler;
            }
          }
          saveProfile();
          updateHUD();
        } catch (e) {}
      },
      cam: function () { try { return DriftCircuit.garage().cam; } catch (e) { return "chase"; } },
      setCam: function (v) {
        try {
          if (v !== "chase" && v !== "far" && v !== "hood") return;
          DriftCircuit.garage().cam = v;
          saveProfile();
        } catch (e) {}
      },
      volume: function () { try { return Number(DriftCircuit.garage().engineVolume); } catch (e) { return 0.7; } },
      setVolume: function (v) {
        try {
          var n = Math.max(0, Math.min(1, Number(v)));
          if (!isFinite(n)) return;
          DriftCircuit.garage().engineVolume = n;
          saveProfile();
        } catch (e) {}
      },
      save: function () { try { saveProfile(); updateHUD(); } catch (e) {} },
    };
  }

  function startApp(container, opts) {
    var options = opts || {};
    if (!webglSupported()) {
      try { console.warn("racing v2 needs WebGL, staying on v1"); } catch (e) {}
      return Promise.resolve(false);
    }
    /* The workshop's 'Scored run' request travels through here. It is
       consumed only once the v2 bundle is confirmed present: consuming it up
       front silently downgraded a paid request to Open Practice whenever v2
       could not boot, because the v1 fallback then found nothing pending. */
    var pendingMode = null;
    return ensureApp().then(function (mod) {
      if (!mod) return false;
      try {
        if (typeof RacingSession !== "undefined" && RacingSession && RacingSession.takePending) {
          pendingMode = RacingSession.takePending();
        }
      } catch (e) {}
      var econ = makeEconomy(pendingMode);
      /* Any failure AFTER the request was consumed must put the scored
         request back, and must refund a token v2 already charged for this
         attempt -- otherwise the v1 fallback either double-charges or
         silently downgrades the paid run to practice. */
      function restoreScoredRequest() {
        try {
          if (pendingMode !== "scored") return;
          if (econ.scoredCharges() > 0) econ.refundScored();
          if (window.RacingSession && RacingSession.request) RacingSession.request("scored");
        } catch (e) {}
      }
      try {
        mod.mount(container, {
          opponents: options.opponents,
          seed: options.seed,
          /* Additive: hosts may request a circuit by id; the game validates
             it and falls back to its default when absent or unknown. */
          track: options.track,
          // The host knows where the game was served from; the bundle cannot
          // reliably work it out, because Vite rewrites import.meta.url.
          assetBase: appBase(),
          economy: econ,
          garage: makeGarage(),
          onQuit: options.onQuit,
          onError: function () {
            try { mod.unmount(); } catch (e) {}
            restoreScoredRequest();
            try { if (typeof options.onFail === "function") options.onFail(); } catch (e) {}
          }
        });
        return true;
      } catch (err) {
        try { console.warn("racing v2 failed to start, staying on v1:", err && err.message); } catch (e) {}
        try { mod.unmount(); } catch (e) {}
        restoreScoredRequest();
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

  /* One-shot pass-through after a v2 startup failure: the retry must run the
     FULL v1 chain below the hook (session rules included) without re-entering
     v2, which is exactly what this flag buys (see the onFail path). */
  var v2Failed = false;

  function teardown(stage) {
    stopApp();
    if (mountEl) mountEl.style.display = "none";
    if (stage) {
      stage.classList.remove("racing-v2-active");
      // Put the stage back the way v1 manages it; backToMenu()/select() will
      // re-add `active` on their own paths.
      stage.classList.remove("active");
    }
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

    /* The one way back to v1 when v2 cannot boot (bundle download failure,
       import failure, mount throw -- every route funnels here). Re-dispatch
       through the CURRENT select chain so racing/session.js runs too: the
       student must get the full v1 experience, session rules included, not a
       bare game with no token accounting. v2Failed makes the re-dispatch pass
       through the v2 hook exactly once. */
    function fallbackToV1(game) {
      v2Failed = true;
      teardown(stage);
      try { arcade.select(game); } catch (e) { v2Failed = false; originalSelect(game); }
    }

    arcade.select = function (game) {
      // Not a driving game, the flag is off, or v2 just failed to start:
      // nothing changes, at all. v2Failed is consumed here so the retry below
      // passes through exactly once.
      if (!V2_GAMES[game] || !enabled() || v2Failed) {
        if (v2Failed) v2Failed = false;
        teardown(stage);
        return originalSelect(game);
      }

      /* Clear the outgoing game exactly the way v1's select() does: stop its
         audio and drop the object. Skipping this left a running v1 engine
         audible over v2 and a stale arcade.game that the money-banking hook
         and the arcade tests read. */
      try {
        if (arcade.game && typeof arcade.game.stopAudio === "function") arcade.game.stopAudio();
      } catch (e) {}
      try { arcade.game = null; } catch (e) {}

      // Open the overlay and try v2. If it declines, fall through to v1 in
      // the same tick so the student never sees a gap.
      var host = ensureMount(stage);
      host.style.display = "block";
      stage.classList.add("racing-v2-active");
      /* SHOW THE STAGE. `.arcade-stage` is display:none until v1's select()
       * adds `active`, and this hook intercepts BEFORE select() runs -- so
       * without the next three lines the game mounts into a 0x0 hidden box
       * and no student ever sees it. It did exactly that until a browser test
       * measured the mount's LAYOUT instead of its display property. */
      try {
        if (typeof arcade.open === "function") arcade.open(); // overlay visible
        if (arcade.menu && arcade.menu.style) arcade.menu.style.display = "none";
      } catch (e) {}
      stage.classList.add("active");

      startApp(host, {
        opponents: 6,
        seed: "race-" + game,
        onFail: function () {
          /* startApp has already restored any scored request it consumed
             (and refunded a token v2 charged for this attempt), so the v1
             fallback runs it as requested instead of downgrading to practice
             or double-charging. */
          fallbackToV1(game);
        },
        onQuit: function () {
          /* The v2 button says "Back to the arcade", so that is what it must
             do. Releasing back to the v1 flow here launched the old drift
             game instead of showing the menu, which was incoherent once v2
             became the default. Original select remains the last resort. */
          teardown(stage);
          try {
            if (typeof arcade !== "undefined" && arcade && typeof arcade.backToMenu === "function") arcade.backToMenu();
            else originalSelect(game);
          } catch (e) { originalSelect(game); }
        }
      }).then(function (started) {
        // The promise is built to never reject; false means the bundle never
        // became usable, and that is the same fallback as any other failure.
        if (!started) fallbackToV1(game);
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
    /* Would a driving-game selection be handled by v2 right now? Used by
       racing/session.js to stay out of the way: v2 runs the session rules
       itself (economy bridge), and double-running them spent a token AND
       started a v1 session underneath a v2 race. FALSE while a fallback is
       in flight, so the v1 retry runs the session wrapper rather than
       deferring to a hook that is currently passing through. */
    willHandle: function (game) { return !v2Failed && !!V2_GAMES[game] && enabled(); },
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
