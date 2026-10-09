/* Deterministic AI driver.
 *
 * The AI consumes exactly the same control struct the player does: throttle,
 * brake, steer, handbrake. It never sets position, velocity or heading, so it
 * cannot teleport, cannot corner faster than its tyres allow, and shows up in a
 * replay the same way a human does.
 *
 * It follows a sampled racing line, targets a speed derived from the curvature
 * ahead, and uses a bounded lateral offset to pass and to avoid. All of its
 * chance comes from a seeded stream, so a race replays identically.
 */
(function (root, factory) {
  var api = factory(
    typeof require === "function" ? require("../core/random.js") : (root.Racing || {}).Random,
    typeof require === "function" ? require("../core/vehicle-physics.js") : (root.Racing || {}).Physics
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).AI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Random, Physics) {
  "use strict";

  var SKILL = {
    easy:   { speed: 0.80, look: 1.5, react: 5.0, offset: 0.55, mistake: 0.010 },
    medium: { speed: 0.90, look: 1.8, react: 7.5, offset: 0.70, mistake: 0.004 },
    hard:   { speed: 0.98, look: 2.1, react: 10.0, offset: 0.85, mistake: 0.001 }
  };

  // Allowance for tyre slip: the road-wheel angle a real corner needs is larger
  // than the geometric kappa*wheelbase, because both axles are running a slip
  // angle. Measured against the model's own steady-state cornering.
  var UNDERSTEER = 1.6;
  var GAIN = 2.6;          // correction gain on the remaining heading error
  // How much of the tyres' capability the AI budgets for braking. Under 1 so a
  // car that is also cornering is not planning to spend grip it has not got.
  var BRAKE_FRACTION = 0.70;
  // The share of the tyres' peak lateral grip that actually shows up as path
  // curvature. Both axles run a slip angle in a steady corner, so the circle the
  // car describes is wider than the one its steering geometry implies.
  var PATH_EFFICIENCY = 0.70;
  var HORIZON_SAMPLES = 20;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function angleDiff(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* `line` is the racing line: {length, at(distance) -> {x, y, heading,
     curvature, half}}. Supplying it as an interface keeps the AI independent of
     how a track happens to be built. */
  function Driver(opts) {
    this.line = opts.line;
    this.car = opts.car;
    this.skill = SKILL[opts.skill] || SKILL.medium;
    this.rng = Random.create(opts.seed == null ? "ai" : opts.seed);
    this.offset = 0;
    this.targetOffset = 0;
    this.progress = opts.startDistance || 0;
    this.lap = 0;
    this.steerState = 0;
    this.id = opts.id || "ai";
  }

  /* Where along the line this car is. Walks forward from the last known point
     rather than searching, which keeps it O(1) and stops the car from latching
     onto the wrong lap of a closed circuit. */
  Driver.prototype.locate = function (state) {
    var line = this.line, best = this.progress, bestD = Infinity;
    var span = 60, stepSize = line.length / 600;
    for (var i = -span; i <= span; i++) {
      var d = (this.progress + i * stepSize + line.length) % line.length;
      var p = line.at(d);
      var dist = (p.x - state.x) * (p.x - state.x) + (p.y - state.y) * (p.y - state.y);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    if (best < this.progress - line.length * 0.5) this.lap++;
    this.progress = best;
    return best;
  };

  /* The control the AI wants this tick. Pure: same state in, same control out. */
  Driver.prototype.control = function (state, rivals, dt) {
    var line = this.line, sk = this.skill;
    var here = this.locate(state);
    var speed = Math.hypot(state.vx, state.vy);

    // Look further ahead the faster we are going.
    var lookDist = clamp(speed * sk.look, 6, 90);
    var ahead = line.at((here + lookDist) % line.length);
    var further = line.at((here + lookDist * 2) % line.length);

    // ---- avoidance: pick a lateral offset, bounded by the road ------------
    this.targetOffset = 0;
    if (rivals && rivals.length) {
      for (var i = 0; i < rivals.length; i++) {
        var r = rivals[i];
        if (r === state) continue;
        var dx = r.x - state.x, dy = r.y - state.y;
        var gap = Math.hypot(dx, dy);
        if (gap > 22 || gap < 0.001) continue;
        // Only react to something actually in front of us.
        var bearing = angleDiff(Math.atan2(dy, dx), state.heading);
        if (Math.abs(bearing) > 0.9) continue;
        var side = bearing >= 0 ? -1 : 1;
        this.targetOffset += side * sk.offset * (1 - gap / 22);
      }
    }
    this.targetOffset = clamp(this.targetOffset, -sk.offset, sk.offset);
    // A seeded wobble, so identical cars do not drive in a perfect column.
    if (this.rng.chance(0.02)) this.targetOffset += this.rng.float(-0.12, 0.12);
    this.offset += (this.targetOffset - this.offset) * clamp(sk.react * dt, 0, 1);
    this.offset = clamp(this.offset, -0.92, 0.92);

    // ---- steering: feed-forward on curvature, plus error correction --------
    // Pure pursuit alone does not work against this physics model. The rack is
    // grip limited (see docs/RACING_PHYSICS.md): a command of 1.0 buys only
    // `steerAuthority * steerMargin` g of lateral acceleration, so the mapping
    // from command to road-wheel angle shrinks as the square of speed. A pure
    // heading-error controller therefore needs a large error before it asks for
    // the angle a fast corner actually requires, and it only ever gets that
    // error by already having run wide. The result was a steady-state
    // understeer that grew through every corner until the car left the road --
    // and it grew faster with the Standard assists on, which trim steering
    // further. The AI looked competent only on a circuit gentle enough that no
    // corner came near the tyres' limit.
    //
    // So the angle the corner needs is computed directly and commanded, and the
    // error term only corrects what is left over.
    var half = ahead.half == null ? 6 : ahead.half;
    var aimX = ahead.x - Math.sin(ahead.heading) * this.offset * half;
    var aimY = ahead.y + Math.cos(ahead.heading) * this.offset * half;
    var want = Math.atan2(aimY - state.y, aimX - state.x);
    var err = angleDiff(want, state.heading);

    // How much road-wheel angle a command of 1.0 is worth right now. This
    // mirrors the limiter in Physics.step; it is the same published car data,
    // not a peek at simulation internals.
    var avail = Math.min(
      this.car.maxSteer,
      (this.car.steerAuthority * Physics.G * this.car.wheelbase) / Math.max(speed * speed, 1) * this.car.steerMargin
    ) / (1 + speed * this.car.steerFalloff * 0.25);

    // The curvature the car is about to be in, rather than the one it is
    // braking for: feeding forward the distant corner's curvature turns in far
    // too early.
    var near = line.at((here + clamp(speed * 0.5, 3, 30)) % line.length);
    // delta = kappa * wheelbase for a neutral car; tyre slip means the real
    // angle is larger, and UNDERSTEER is that allowance.
    var ff = avail > 1e-6 ? clamp((near.curvature || 0) * this.car.wheelbase * UNDERSTEER / avail, -1, 1) : 0;

    // Yaw damping on the controller's own output, so the feed-forward step at a
    // corner entry does not set up an oscillation.
    var damp = speed > 4 ? clamp(state.yawRate * 0.35 - (near.curvature || 0) * speed * 0.35, -0.5, 0.5) : 0;
    var steer = clamp(ff + err * GAIN - damp, -1, 1);

    // ---- speed target: a braking plan, not a lookahead ---------------------
    // Sampling the curvature at one or two fixed points ahead cannot work. The
    // distance needed to slow from 200 km/h to a 70 km/h corner is about 180 m,
    // and the old lookahead was capped at 90 m, so the car arrived at every
    // fast corner already far too quick, understeered off, and finished the lap
    // in the scenery. It only looked adequate on a gentle test oval where no
    // corner ever demanded a real brake.
    //
    // Instead: walk a horizon as long as the car's own stopping distance, and at
    // each point ask what speed HERE would let it still be slow enough THERE.
    // v_allowed = sqrt(v_corner^2 + 2*a*d) is that, and taking the minimum over
    // the horizon finds the corner that is braking-critical right now, however
    // far away it is.
    var capable = this.car.steerAuthority * Physics.G * PATH_EFFICIENCY * sk.speed;
    var aBrake = this.car.steerAuthority * Physics.G * BRAKE_FRACTION;
    var horizon = clamp(speed * speed / (2 * aBrake) + 15, 25, 400);
    var target = 999;
    for (var h = 1; h <= HORIZON_SAMPLES; h++) {
      var d = horizon * h / HORIZON_SAMPLES;
      var kk = Math.abs(line.at((here + d) % line.length).curvature || 0);
      var corner = kk > 1e-5 ? Math.sqrt(capable / kk) : 999;
      var allow = Math.sqrt(corner * corner + 2 * aBrake * d);
      if (allow < target) target = allow;
    }
    // And the corner the car is in, which no lookahead point covers.
    var kNow = Math.abs(near.curvature || 0);
    if (kNow > 1e-5) target = Math.min(target, Math.sqrt(capable / kNow));
    target = clamp(target, 4, 150);

    var throttle = 0, brake = 0;
    if (speed < target * 0.96) throttle = clamp((target - speed) / 6, 0, 1);
    else if (speed > target * 1.04) brake = clamp((speed - target) / 8, 0, 1);

    // Tightening the wheel costs grip, so ease off while cornering hard.
    throttle *= 1 - clamp(Math.abs(steer) * 0.45, 0, 0.55);

    // Rare, small, seeded mistakes keep a field from driving in lockstep.
    if (this.rng.chance(sk.mistake)) { steer += this.rng.float(-0.2, 0.2); throttle *= 0.75; }

    this.steerState = steer;
    return {
      throttle: clamp(throttle, 0, 1),
      brake: clamp(brake, 0, 1),
      steer: clamp(steer, -1, 1),
      handbrake: 0
    };
  };

  return { SKILL: SKILL, Driver: Driver, create: function (o) { return new Driver(o); } };
});
