/* Ghost recording and playback.
 *
 * A ghost is not a path. Storing positions would let anyone hand the server a
 * fabricated line, and it would desync the moment the physics changed. A ghost
 * here is the INPUT the player gave, plus the seed and version it was given
 * under. Playback re-runs the same simulation and gets the same car back, which
 * is only possible because the clock is fixed-step and nothing in the model
 * touches Math.random().
 *
 * Inputs are stored as changes, not as one record per tick. A player holding
 * the throttle through a straight produces one entry, not six hundred, so a
 * five-minute run compresses to a few kilobytes.
 *
 * Periodic checkpoints carry a hash chain. They are what catches a corrupted or
 * edited recording: replaying the inputs must reproduce every checkpoint in
 * order, and each hash covers the one before it, so a single edited frame
 * invalidates the whole tail.
 */
(function (root, factory) {
  var api = factory(
    typeof require === "function" ? require("../core/fixed-step.js") : (root.Racing || {}).FixedStep,
    typeof require === "function" ? require("../core/vehicle-physics.js") : (root.Racing || {}).Physics
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).Ghost = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (FixedStep, Physics) {
  "use strict";

  var FORMAT = 1;
  var CHECKPOINT_EVERY = 60;   // one per simulated second
  var QUANT = 100;             // inputs stored to 1/100, which is finer than any player
  var MAX_TICKS = 60 * 60 * 10; // ten minutes; longer is rejected rather than stored

  function q(v) { return Math.round((v || 0) * QUANT) / QUANT; }

  /* Round an input to the resolution a ghost stores.
   *
   * The live loop MUST pass its input through this before stepping the physics,
   * so that what was simulated is exactly what gets recorded. Quantising only
   * inside the recorder means the replay drives slightly different numbers than
   * the player did, and the two diverge within a couple of seconds. */
  function quantize(input) {
    return {
      throttle: q(clamp01(input.throttle)),
      brake: q(clamp01(input.brake)),
      steer: q(Math.max(-1, Math.min(1, input.steer || 0))),
      handbrake: q(clamp01(input.handbrake))
    };
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : (v || 0); }

  /* FNV-1a over a string. Not a security hash on its own: it makes a recording
     self-consistent so casual edits are caught. The server is what decides
     whether a run is believable; this only proves the file was not altered
     after it was written. */
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h >>> 0).toString(36);
  }

  function sameInput(a, b) {
    return a && b && a.throttle === b.throttle && a.brake === b.brake &&
           a.steer === b.steer && a.handbrake === b.handbrake;
  }

  // ---- recording ----------------------------------------------------------

  function Recorder(meta) {
    this.meta = {
      format: FORMAT,
      physicsVersion: Physics.VERSION,
      seed: meta.seed,
      carId: meta.carId,
      trackId: meta.trackId,
      weather: meta.weather || "dry",
      difficulty: meta.difficulty || "standard",
      tune: meta.tune || null,
      startedAt: meta.startedAt || 0
    };
    this.inputs = [];       // [tick, throttle, brake, steer, handbrake]
    this.checkpoints = [];  // {tick, x, y, heading, h}
    this.last = null;
    this.chain = hash(JSON.stringify(this.meta));
    this.ticks = 0;
  }

  /* Call once per simulated tick, with the input that tick was given. */
  Recorder.prototype.record = function (tick, input, state) {
    var cur = quantize(input);
    if (!sameInput(cur, this.last)) {
      this.inputs.push([tick, cur.throttle, cur.brake, cur.steer, cur.handbrake]);
      this.last = cur;
    }
    this.ticks = tick;
    if (state && tick % CHECKPOINT_EVERY === 0) {
      var snap = Physics.snapshot(state);
      this.chain = hash(this.chain + "|" + snap.tick + "," + snap.x + "," + snap.y + "," + snap.heading);
      this.checkpoints.push({ tick: snap.tick, x: snap.x, y: snap.y, heading: snap.heading, h: this.chain });
    }
    return this;
  };

  Recorder.prototype.finish = function (summary) {
    return {
      meta: this.meta,
      ticks: this.ticks,
      inputs: this.inputs,
      checkpoints: this.checkpoints,
      summary: summary || {},
      chain: this.chain
    };
  };

  // ---- playback -----------------------------------------------------------

  /* Expands the change list back into a per-tick lookup. */
  function Reader(ghost) {
    this.ghost = ghost;
    this.i = 0;
    this.cur = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  }
  Reader.prototype.at = function (tick) {
    var list = this.ghost.inputs;
    while (this.i < list.length && list[this.i][0] <= tick) {
      var e = list[this.i];
      this.cur = { throttle: e[1], brake: e[2], steer: e[3], handbrake: e[4] };
      this.i++;
    }
    return this.cur;
  };
  Reader.prototype.reset = function () { this.i = 0; this.cur = { throttle: 0, brake: 0, steer: 0, handbrake: 0 }; return this; };

  /* Re-simulate a ghost. `cars` is the car table, so playback uses the same
     record the run was driven with. Returns the final state and, when asked,
     every checkpoint it produced along the way. */
  function replay(ghost, cars, opts) {
    opts = opts || {};
    var car = cars.get(ghost.meta.carId);
    if (ghost.meta.tune) car = Object.assign({}, car, { tune: ghost.meta.tune });
    var state = Physics.createState(car, opts.start);
    var env = { difficulty: ghost.meta.difficulty, weather: ghost.meta.weather };
    var reader = new Reader(ghost);
    var produced = [];
    var chain = hash(JSON.stringify(ghost.meta));
    var step = FixedStep.STEP;
    var until = Math.min(ghost.ticks, opts.untilTick == null ? ghost.ticks : opts.untilTick);

    for (var tick = 1; tick <= until; tick++) {
      Physics.step(state, car, reader.at(tick), env, step);
      if (tick % CHECKPOINT_EVERY === 0) {
        var snap = Physics.snapshot(state);
        chain = hash(chain + "|" + snap.tick + "," + snap.x + "," + snap.y + "," + snap.heading);
        produced.push({ tick: snap.tick, x: snap.x, y: snap.y, heading: snap.heading, h: chain });
      }
      if (opts.onTick) opts.onTick(state, tick);
    }
    return { state: state, checkpoints: produced, chain: chain };
  }

  /* Does this recording replay to what it claims? Returns a reason on failure
     rather than a bare false, because the server logs why a run was rejected. */
  function verify(ghost, cars, opts) {
    opts = opts || {};
    var tolerance = opts.tolerance == null ? 0.5 : opts.tolerance; // metres

    if (!ghost || !ghost.meta) return { ok: false, reason: "malformed" };
    if (ghost.meta.format !== FORMAT) return { ok: false, reason: "unknown format" };
    if (ghost.meta.physicsVersion !== Physics.VERSION) return { ok: false, reason: "physics version mismatch" };
    // Number.isInteger, not isFinite: isFinite coerces, so the string "600"
    // passed every numeric check and was accepted as a tick count.
    if (!Number.isInteger(ghost.ticks) || ghost.ticks <= 0 || ghost.ticks > MAX_TICKS) {
      return { ok: false, reason: "implausible length" };
    }
    if (!Array.isArray(ghost.inputs) || !Array.isArray(ghost.checkpoints)) return { ok: false, reason: "malformed" };

    // Ticks must be whole, strictly increasing and inside the run; every value
    // must be a finite number. Range comparisons alone are not enough, because
    // every comparison against NaN is false and JSON turns NaN and Infinity into
    // null -- so malformed values passed validation and reached the physics,
    // where they were only caught incidentally by the checkpoint comparison.
    for (var i = 0; i < ghost.inputs.length; i++) {
      var e = ghost.inputs[i];
      if (!Array.isArray(e) || e.length !== 5) return { ok: false, reason: "malformed input entry" };
      for (var k = 0; k < 5; k++) {
        if (typeof e[k] !== "number" || !isFinite(e[k])) return { ok: false, reason: "non-numeric input value" };
      }
      if (!Number.isInteger(e[0])) return { ok: false, reason: "fractional input tick" };
      if (i > 0 && e[0] <= ghost.inputs[i - 1][0]) return { ok: false, reason: "non-monotonic input ticks" };
      if (e[0] < 0 || e[0] > ghost.ticks) return { ok: false, reason: "input outside the run" };
      if (e[1] < 0 || e[1] > 1 || e[2] < 0 || e[2] > 1 || e[4] < 0 || e[4] > 1 || e[3] < -1 || e[3] > 1) {
        return { ok: false, reason: "input out of range" };
      }
    }
    // Checkpoints must be well formed too: they are compared numerically below.
    for (var c2 = 0; c2 < ghost.checkpoints.length; c2++) {
      var cp = ghost.checkpoints[c2];
      if (!cp || typeof cp !== "object") return { ok: false, reason: "malformed checkpoint" };
      if (!Number.isInteger(cp.tick) || !isFinite(cp.x) || !isFinite(cp.y) ||
          typeof cp.x !== "number" || typeof cp.y !== "number" || typeof cp.h !== "string") {
        return { ok: false, reason: "malformed checkpoint" };
      }
    }
    // A player cannot change input every single tick for a whole run.
    if (ghost.inputs.length > ghost.ticks * 0.9 && ghost.ticks > 120) {
      return { ok: false, reason: "implausible input frequency" };
    }

    var out = replay(ghost, cars);
    if (out.checkpoints.length !== ghost.checkpoints.length) return { ok: false, reason: "checkpoint count mismatch" };
    for (var c = 0; c < out.checkpoints.length; c++) {
      var mine = out.checkpoints[c], theirs = ghost.checkpoints[c];
      if (mine.tick !== theirs.tick) return { ok: false, reason: "checkpoint tick mismatch at " + c };
      var drift = Math.hypot(mine.x - theirs.x, mine.y - theirs.y);
      if (drift > tolerance) return { ok: false, reason: "checkpoint diverged by " + drift.toFixed(2) + "m at tick " + mine.tick };
      if (mine.h !== theirs.h) return { ok: false, reason: "hash chain broken at tick " + mine.tick };
    }
    if (out.chain !== ghost.chain) return { ok: false, reason: "final hash mismatch" };
    return { ok: true, state: out.state };
  }

  /* Approximate stored size, so a client can refuse to upload something absurd
     before the server has to. */
  function size(ghost) { return JSON.stringify(ghost).length; }

  return {
    FORMAT: FORMAT,
    CHECKPOINT_EVERY: CHECKPOINT_EVERY,
    MAX_TICKS: MAX_TICKS,
    Recorder: Recorder,
    quantize: quantize,
    Reader: Reader,
    record: function (meta) { return new Recorder(meta); },
    replay: replay,
    verify: verify,
    size: size,
    hash: hash
  };
});
