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
  var UNDERSTEER = 1.0;   // road-wheel angle allowance for tyre slip
  var SLEW = 2.6;           // how fast the command may move, per second
  var SLIDE_LIMIT = 0.26;   // rear slip angle past which the driver catches it
  var CROSS_GAIN = 1.0;     // how hard a lateral offset is pulled back
  var HEAD_GAIN = 1.0;      // how hard a heading error is pulled back
  var SETTLE_PER_SPEED = 2.2; // settling distance, in seconds of travel
  var YAW_DAMP = 0.6;       // derivative feedback on the yaw-rate error
  var CROSS_CLAMP = 12;     // metres of offset the correction saturates at
  var KMAX_DEMAND = 0.09;   // never ask for a radius under ~11 m
  // How much of the tyres' capability the AI budgets for braking. Under 1 so a
  // car that is also cornering is not planning to spend grip it has not got.
  var BRAKE_FRACTION = 0.70;
  /* How much lateral acceleration the AI plans its corner speeds around, as a
   * fraction of the tyres' peak.
   *
   * This is deliberately far below what the car can physically do, and the
   * number is honest about being a property of the DRIVER rather than of the
   * tyres. Measured by capping the car's speed and driving every circuit: this
   * controller holds the racing line to within a few metres up to about 80 km/h
   * in a corner, and above that the line it tracks diverges faster than it can
   * correct, so the car ends up in the scenery and finishes a 120-second run
   * having covered LESS ground than if it had gone slowly. 0.15 is the largest
   * value at which all seven circuits, all three skill levels and all ten cars
   * complete without a wheel off the road.
   *
   * The visible consequence is that AI cars are quick on a straight (they reach
   * about 140 km/h) and conservative through a corner. Raising it is a matter of
   * a better driver model -- a planned racing line with proper apexes, rather
   * than a tracker chasing the centre line -- not of turning this constant up.
   */
  var CORNER_BUDGET = 0.15;
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
    /* The grip the driver expects to find, 1 for a dry road. A driver who does
       not know it is raining plans dry corner speeds and arrives at every one of
       them too fast; the physics then gives it 68% of the grip and the car goes
       straight on. The caller passes the track's own weather figure. */
    this.grip = opts.grip == null ? 1 : clamp(opts.grip, 0.2, 1);
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

    var half = ahead.half == null ? 6 : ahead.half;

    // ---- steering ----------------------------------------------------------
    // The original controller was pure pursuit on heading error with a fixed
    // gain. Against this physics model that cannot work, and it failed three
    // different ways depending on how hard it was pushed.
    //
    //   * The rack is grip limited (docs/RACING_PHYSICS.md): a command of 1.0
    //     buys a road-wheel angle that shrinks with the square of speed. A
    //     heading-error controller only asks for what a fast corner needs once
    //     it has already run wide, so the car understeered a little further out
    //     of every corner until it left the road.
    //   * Winding the gain up to compensate slammed the wheel from lock to lock,
    //     broke the rear away and span the car.
    //   * Steering on HEADING at all is wrong. In a corner the body runs a slip
    //     angle, so the direction the car travels is rotated from the direction
    //     it points, and a heading controller never sees that difference. The
    //     car crabs quietly to the inside of every bend -- a drift that reaches
    //     the kerb while the heading error is still two hundredths of a radian.
    //
    // What replaces it is the standard front-axle path-tracking law, which
    // closes on the path from any offset and has no lookahead to mistune:
    //
    //     delta = (path heading - course) + atan(k * crossTrack / v)
    //
    // plus the road's own curvature fed forward, and then two things no
    // textbook controller has but every driver does: a limit on how fast the
    // hands can move, and giving up on the line to catch a slide.
    var hereP = line.at(here);

    // Course, not heading: the direction the car is actually travelling.
    var course = speed > 2 ? state.heading + Math.atan2(state.vy, Math.abs(state.vx) + 0.001) : state.heading;
    var headErr = angleDiff(hereP.heading, course);

    // Signed offset from the line the car is trying to be on; + is to the left
    // of travel, matching the physics' body frame.
    var cross = (state.x - hereP.x) * -Math.sin(hereP.heading) + (state.y - hereP.y) * Math.cos(hereP.heading);
    var crossErr = clamp(this.offset * half - cross, -CROSS_CLAMP, CROSS_CLAMP);

    // How much road-wheel angle a command of 1.0 is worth right now. This
    // mirrors the limiter in Physics.step, from the same published car data; it
    // is not a peek at simulation internals.
    var avail = Math.min(
      this.car.maxSteer,
      (this.car.steerAuthority * Physics.G * this.car.wheelbase) / Math.max(speed * speed, 1) * this.car.steerMargin
    ) / (1 + speed * this.car.steerFalloff * 0.25);

    // The curvature of the road the car is on, rather than the corner it is
    // braking for: feeding the distant corner forward turns in far too early.
    var near = line.at((here + clamp(speed * 0.45, 3, 25)) % line.length);
    // Both corrections are expressed as curvature, over a settling distance
    // that grows with speed. That is the scaling that matters: the useful
    // road-wheel angle at 120 km/h is about two degrees, so a correction stated
    // in radians rather than in curvature is either inaudible or full lock, with
    // nothing in between. An earlier attempt at this law stated the heading and
    // cross terms as angles directly and the controller was effectively
    // bang-bang -- a third of a metre off line asked for 70% of the available
    // lock, and the car oscillated itself off the road.
    var settle = clamp(speed * SETTLE_PER_SPEED, 28, 95);
    var kHead = HEAD_GAIN * 2 * Math.sin(headErr) / settle;
    var kCross = CROSS_GAIN * 2 * crossErr / (settle * settle);
    var kDemand = clamp((near.curvature || 0) + kHead + kCross, -KMAX_DEMAND, KMAX_DEMAND);

    // delta = kappa * wheelbase for a neutral car; both axles run a slip angle,
    // so the real angle is larger and UNDERSTEER is that allowance.
    var ff = kDemand * this.car.wheelbase * UNDERSTEER;

    // Derivative feedback, and not optional. A purely proportional path tracker
    // against a vehicle with this much yaw lag oscillates: the correction
    // arrives after the car has already come back, so the next correction is
    // bigger and the opposite way, and within three swings the command is going
    // lock to lock at 115 km/h. The yaw-rate error -- what the corner asks the
    // car to rotate at, against what it is rotating at -- is the derivative of
    // the heading error, and feeding it back is what stops that.
    var yawErr = speed > 3 ? kDemand * speed - state.yawRate : 0;
    var delta = ff + YAW_DAMP * yawErr * this.car.wheelbase / Math.max(speed, 4);
    var raw = avail > 1e-6 ? clamp(delta / avail, -1, 1) : 0;

    // A rear axle past its peak needs catching, not more lock. The stabilising
    // input follows the sign of the rear slip, as in the physics' own assists.
    var slide = clamp((Math.abs(state.slipR) - SLIDE_LIMIT) / 0.22, 0, 1);
    if (slide > 0) raw = raw * (1 - slide) + clamp(state.slipR * 2.4, -1, 1) * slide;

    // Finite hands. Lock to lock in about half a second.
    var hop = SLEW * dt;
    var steer = clamp(this.steerState + clamp(raw - this.steerState, -hop, hop), -1, 1);

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
    var capable = this.car.steerAuthority * Physics.G * CORNER_BUDGET * sk.speed * this.grip;
    var aBrake = this.car.steerAuthority * Physics.G * BRAKE_FRACTION * this.grip;
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

    // Tightening the wheel costs grip, so ease off while cornering hard, and
    // come off it altogether once the rear is away: throttle is what keeps a
    // slide going.
    throttle *= 1 - clamp(Math.abs(steer) * 0.45, 0, 0.55);
    throttle *= 1 - slide * 0.85;

    // Rare, small, seeded mistakes keep a field from driving in lockstep.
    if (this.rng.chance(sk.mistake)) { steer += this.rng.float(-0.2, 0.2); throttle *= 0.75; }

    this.steerState = steer;
    /* What the controller decided this tick, for tests and for diagnosing a
       driver that is not getting round. Read-only to everyone else. */
    this.debug = {
      here: here, lookDist: lookDist, headErr: headErr, cross: cross, crossErr: crossErr,
      kDemand: kDemand, avail: avail, delta: delta,
      ff: ff, yawErr: yawErr, slide: slide, raw: raw, target: target, horizon: horizon
    };
    return {
      throttle: clamp(throttle, 0, 1),
      brake: clamp(brake, 0, 1),
      steer: clamp(steer, -1, 1),
      handbrake: 0
    };
  };

  return { SKILL: SKILL, Driver: Driver, create: function (o) { return new Driver(o); } };
});
