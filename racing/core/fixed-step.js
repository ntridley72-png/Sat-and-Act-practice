/* Fixed-timestep accumulator.
 *
 * The simulation must advance in identical discrete ticks no matter how fast
 * the browser happens to be painting. A 30 FPS Chromebook, a 60 FPS laptop and
 * a 120 Hz display all have to produce the same car at the same tick, or ghost
 * replays desync and a server re-simulation disagrees with the client.
 *
 * Render time therefore never reaches the physics. Frames deposit elapsed time
 * into an accumulator; the accumulator pays it out in whole ticks of exactly
 * STEP seconds. Whatever is left over is handed to the renderer as `alpha` for
 * interpolation, so motion still looks smooth between ticks.
 *
 * Long stalls are capped rather than replayed. A tab that was hidden for ten
 * minutes must not run 36,000 ticks on resume: that would freeze the page and,
 * worse, let the car cover ground the player never drove.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).FixedStep = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STEP = 1 / 60;          // the one true tick length
  var MAX_CATCHUP = 4;        // whole ticks replayed after a stall, then drop
  var MAX_FRAME = 0.25;       // a single frame never deposits more than this

  function Clock(opts) {
    opts = opts || {};
    this.step = opts.step || STEP;
    this.maxCatchup = opts.maxCatchup || MAX_CATCHUP;
    this.maxFrame = opts.maxFrame || MAX_FRAME;
    this.reset();
  }

  Clock.prototype.reset = function () {
    this.tick = 0;            // monotonic tick number; the run's clock
    this.acc = 0;             // unspent time
    this.alpha = 0;           // 0..1 position between the last two ticks
    this.paused = false;
    this.dropped = 0;         // ticks discarded to stalls, for diagnostics
    this.simulated = 0;       // seconds of simulation actually run
    return this;
  };

  Clock.prototype.pause = function () { this.paused = true; return this; };
  // Resuming throws away the accumulator: time spent paused is not owed.
  Clock.prototype.resume = function () { this.paused = false; this.acc = 0; return this; };

  /* Advance by one frame's elapsed seconds, calling fn(step, tickNumber) for
     each whole tick. Returns how many ticks ran. */
  Clock.prototype.advance = function (elapsed, fn) {
    if (this.paused) return 0;
    if (!isFinite(elapsed) || elapsed <= 0) return 0;

    // A frame longer than maxFrame means the page stalled, not that the player
    // drove for that long. Bill one frame's worth and discard the rest.
    if (elapsed > this.maxFrame) {
      this.dropped += Math.floor((elapsed - this.maxFrame) / this.step);
      elapsed = this.maxFrame;
    }

    this.acc += elapsed;
    var ran = 0;
    while (this.acc >= this.step && ran < this.maxCatchup) {
      this.acc -= this.step;
      this.tick++;
      ran++;
      this.simulated += this.step;
      if (fn) fn(this.step, this.tick);
    }
    // Still behind after the catch-up budget: drop the backlog instead of
    // spiralling. Dropping time is visible as a small jump; spiralling is not
    // recoverable.
    if (this.acc >= this.step) {
      this.dropped += Math.floor(this.acc / this.step);
      this.acc = this.acc % this.step;
    }
    this.alpha = this.acc / this.step;
    return ran;
  };

  /* Seconds of simulated time elapsed, derived from ticks rather than the wall
     clock, so it matches exactly between a live run and its replay. */
  Clock.prototype.seconds = function () { return this.tick * this.step; };

  Clock.prototype.state = function () {
    return { tick: this.tick, acc: this.acc, dropped: this.dropped, simulated: this.simulated };
  };
  Clock.prototype.restore = function (s) {
    this.tick = s.tick | 0;
    this.acc = +s.acc || 0;
    this.dropped = s.dropped | 0;
    this.simulated = +s.simulated || 0;
    this.alpha = this.acc / this.step;
    return this;
  };

  return {
    STEP: STEP,
    MAX_CATCHUP: MAX_CATCHUP,
    MAX_FRAME: MAX_FRAME,
    Clock: Clock,
    create: function (opts) { return new Clock(opts); }
  };
});
