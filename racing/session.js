/* Racing and drifting session rules.
 *
 * Two ways to drive, and they are deliberately different:
 *
 *   Open Practice  free, unlimited, and never scored. It costs no token, banks
 *                  no garage cash, and cannot set a high score. It is always
 *                  available, including with an empty wallet.
 *
 *   Scored run     costs exactly one practice token and grants five minutes of
 *                  ACTIVE driving. It never auto-renews: when the allowance is
 *                  gone the run ends and the player must spend another token
 *                  deliberately.
 *
 * "Active" is the whole point of this file. The arcade's own clock counts wall
 * time, which would charge the player for a paused game, a backgrounded tab, a
 * suspended laptop, or time spent in the garage. This module takes the clock
 * over for racing sessions and only spends the allowance while the player is
 * actually driving. Three minutes without input ends the run safely rather than
 * draining it in the background.
 *
 * Loads after app.js and wraps the arcade in place, so none of the rules here
 * change how the other arcade games are billed.
 */
(function () {
  "use strict";
  if (typeof arcade === "undefined" || !arcade) return;

  var MAX_SEC = 300;        // five minutes of active driving per token
  var IDLE_END_SEC = 180;   // three idle minutes ends the run safely
  var TOKEN_COST = 1;
  var MOVING_SPEED = 30;    // coasting this fast still counts as driving
  var INPUT_GRACE_MS = 600; // a keypress keeps the clock live this long
  var MAX_STEP_SEC = 0.25;  // never bill more than this from one frame

  var RACING_KEYS = ["drift", "racing"];

  var S = {
    mode: null,       // 'practice' | 'scored' | null
    pending: null,    // mode requested for the next select()
    remaining: 0,
    idle: 0,
    lastInput: 0,
    lastTick: 0,
    ended: false
  };

  function isRacing(game) { return !!game && RACING_KEYS.indexOf(game.key) >= 0; }
  function active() { return S.mode && isRacing(arcade.game); }
  function now() { return Date.now(); }
  function toast(m) { try { showToast(m); } catch (_) {} }

  // ---- activity ------------------------------------------------------------
  // Any real control gesture counts. Pointer and key events are captured so a
  // game that swallows them still registers as activity.
  function noteInput() { S.lastInput = now(); }
  ["keydown", "pointerdown", "pointermove", "touchstart", "wheel"].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      if (evt === "pointermove" && !(e.buttons)) return; // hovering is not driving
      noteInput();
    }, true);
  });

  function heldKey() {
    var k = arcade._heldKeys;
    if (!k) return false;
    for (var n in k) if (k[n]) return true;
    return false;
  }
  function touching(game) {
    var t = game && game.touch;
    if (!t) return false;
    for (var n in t) if (t[n]) return true;
    return false;
  }
  function movingFast(game) {
    if (!game) return false;
    if (isFinite(game.speed) && Math.abs(game.speed) > MOVING_SPEED) return true;
    if (isFinite(game.vx) && isFinite(game.vy)) return Math.hypot(game.vx, game.vy) > MOVING_SPEED;
    return false;
  }
  function garageOpen() {
    var el = document.getElementById("driftGarage");
    return !!el && !el.hidden;
  }
  // The allowance is spent only while the player is driving: inputs, held keys,
  // or a car still carrying speed. Everything else is free.
  function driving(game) {
    if (now() - S.lastInput < INPUT_GRACE_MS) return true;
    return heldKey() || touching(game) || movingFast(game);
  }

  // ---- lifecycle -----------------------------------------------------------
  function request(mode) { S.pending = mode === "scored" ? "scored" : "practice"; }

  function canAfford() { return profile.tokens >= TOKEN_COST; }

  function begin(mode) {
    S.mode = mode;
    S.remaining = mode === "scored" ? MAX_SEC : Infinity;
    S.idle = 0;
    S.ended = false;
    S.lastInput = now();
    S.lastTick = now();
  }

  function clear() { S.mode = null; S.pending = null; S.remaining = 0; S.idle = 0; S.ended = false; }

  function label() {
    if (S.mode === "practice") return "Open Practice — free, not scored";
    if (S.mode === "scored") return "Scored run — " + fmt(S.remaining) + " of driving left";
    return "";
  }
  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  // ---- arcade integration --------------------------------------------------
  var origSelect = arcade.select.bind(arcade);
  arcade.select = function (game) {
    var wanted = S.pending;
    S.pending = null;
    if (RACING_KEYS.indexOf(game) < 0) { clear(); return origSelect(game); }

    // Default to free practice when nothing asked for a scored run, so opening
    // drift or racing from the cabinet never silently spends a token.
    var mode = wanted === "scored" ? "scored" : "practice";
    if (mode === "scored" && !canAfford()) {
      toast("No tokens — answer questions to earn one, or drive Open Practice free");
      mode = "practice";
    }

    // select() bills the shared arcade clock. Racing sessions pay their own way,
    // so the banked arcade time is put back exactly as it was found.
    var carry = arcade.remainingCarry, tokensBefore = profile.tokens;
    var r = origSelect(game);
    arcade.remainingCarry = carry;
    profile.tokens = tokensBefore;

    if (mode === "scored") profile.tokens -= TOKEN_COST;
    begin(mode);
    arcade.runMode = "racing";
    arcade.remaining = mode === "scored" ? MAX_SEC : MAX_SEC * 100;
    try { saveProfile(); updateHUD(); } catch (_) {}
    if (arcade.statusEl) {
      arcade.statusEl.textContent = (arcade.game ? arcade.game.name : "") + " — " + label() +
        " — Press SPACE or tap to start (↑ gas, ←→ steer, SPACE handbrake)";
    }
    try { arcade.updateChips(); } catch (_) {}
    return r;
  };

  // A racing session never rolls into another token on its own.
  var origRefill = arcade.autoRefill.bind(arcade);
  arcade.autoRefill = function () { return active() ? false : origRefill(); };

  var origAddTime = arcade.addTime.bind(arcade);
  arcade.addTime = function () {
    if (!active()) return origAddTime();
    if (S.mode === "practice") { toast("Open Practice is free and unlimited — no time to add"); return; }
    toast("A scored run is one token for five minutes and does not extend. Finish it, then start another.");
  };

  // The clock. origLoop counts wall time, so its deduction is undone and
  // replaced with one that only charges for active driving.
  var origLoop = arcade.loop.bind(arcade);
  arcade.loop = function () {
    if (!active()) return origLoop();
    var before = arcade.remaining;
    var r = origLoop();
    if (arcade.mode === "menu" || arcade.mode === "over" || arcade.mode === "timeup") return r;
    arcade.remaining = before;

    var t = now();
    var dt = Math.min((t - S.lastTick) / 1000, MAX_STEP_SEC);
    S.lastTick = t;
    if (dt <= 0) return r;

    var playing = arcade.mode === "playing" && arcade.game && arcade.game.started && !arcade.game.over;
    // Paused, hidden, suspended, or sitting in the garage: nothing is spent and
    // the idle timer does not run either.
    if (!playing || document.hidden || garageOpen()) return r;

    if (driving(arcade.game)) {
      S.idle = 0;
      if (S.mode === "scored") {
        S.remaining -= dt;
        arcade.remaining = Math.max(0, S.remaining);
        if (S.remaining <= 0 && !S.ended) { S.ended = true; toast("Scored run finished — five minutes used"); arcade.timeUp(); }
      }
    } else {
      S.idle += dt;
      if (S.idle >= IDLE_END_SEC && !S.ended) {
        S.ended = true;
        toast("Ended after three idle minutes — the rest of your run was not used");
        arcade.timeUp();
      }
    }
    try { arcade.updateChips(); } catch (_) {}
    return r;
  };

  // Practice must leave no trace in the economy: no garage cash, no high score.
  ["gameOver", "timeUp"].forEach(function (name) {
    var orig = arcade[name].bind(arcade);
    arcade[name] = function () {
      if (S.mode !== "practice" || !isRacing(arcade.game)) return orig.apply(arcade, arguments);
      var game = arcade.game, key = game.key;
      var prevHigh = (profile.highScores && profile.highScores[key]) || 0;
      game.earned = 0; // the cash hook in app.js reads this
      var r = orig.apply(arcade, arguments);
      try {
        if (profile.highScores) profile.highScores[key] = prevHigh;
        saveProfile();
      } catch (_) {}
      toast("Practice run — nothing scored or banked. Start a scored run to set a record.");
      return r;
    };
  });

  var origPlayAgain = arcade.playAgain.bind(arcade);
  arcade.playAgain = function () {
    if (!active()) return origPlayAgain();
    if (S.mode === "practice") { begin("practice"); arcade.remaining = MAX_SEC * 100; return origPlayAgain(); }
    // A second scored run is a second token, chosen deliberately.
    if (S.remaining > 0) { S.lastTick = now(); return origPlayAgain(); }
    if (!canAfford()) {
      toast("Out of tokens — switching to free Open Practice");
      begin("practice");
      arcade.remaining = MAX_SEC * 100;
      return origPlayAgain();
    }
    profile.tokens -= TOKEN_COST;
    begin("scored");
    arcade.remaining = MAX_SEC;
    try { saveProfile(); updateHUD(); } catch (_) {}
    toast("New scored run — 1 token, five minutes of driving");
    return origPlayAgain();
  };

  var origBackToMenu = arcade.backToMenu && arcade.backToMenu.bind(arcade);
  if (origBackToMenu) arcade.backToMenu = function () { clear(); return origBackToMenu.apply(arcade, arguments); };

  // Coming back from a suspended tab must not bill the gap.
  document.addEventListener("visibilitychange", function () { if (!document.hidden) S.lastTick = now(); });

  window.RacingSession = {
    MAX_SEC: MAX_SEC,
    IDLE_END_SEC: IDLE_END_SEC,
    TOKEN_COST: TOKEN_COST,
    request: request,
    start: function (mode) { request(mode); arcade.select("drift"); arcade.play(); },
    state: function () { return { mode: S.mode, remaining: S.remaining, idle: S.idle, ended: S.ended }; },
    label: label,
    canAfford: canAfford,
    // Exposed for tests: drive the clock without waiting in real time.
    _tick: function (seconds, opts) {
      opts = opts || {};
      if (!S.mode) return;
      if (opts.driving === false) {
        S.idle += seconds;
        if (S.idle >= IDLE_END_SEC && !S.ended) { S.ended = true; arcade.timeUp(); }
        return;
      }
      S.idle = 0;
      if (S.mode !== "scored") return;
      S.remaining -= seconds;
      arcade.remaining = Math.max(0, S.remaining);
      if (S.remaining <= 0 && !S.ended) { S.ended = true; arcade.timeUp(); }
    }
  };
})();
