/* Simcade vehicle model.
 *
 * Original equations written for this game. No VDrift source, constants, class
 * structure or translated code. The model is a two-axle bicycle: front and rear
 * axles each carry one effective tyre, which is enough to produce slip angles,
 * load transfer, countersteer and a handbrake slide while staying cheap enough
 * for a low-end Chromebook at 60 Hz.
 *
 * Units are metres, seconds, kilograms and radians. The arcade's own display
 * scale is applied by the renderer, never here.
 *
 * Every function is pure with respect to time: `step` mutates one state object
 * by exactly one tick and reads nothing else. That is what makes a run
 * reproducible from its seed and input log.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).Physics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var G = 9.81;
  var VERSION = 1;          // bump when behaviour changes; ghosts carry it
  var SPEED_FLOOR = 0.6;    // below this the slip-angle maths is meaningless
  // Tyres are load sensitive: grip grows more slowly than the load on them, so
  // a heavily loaded axle is proportionally less effective than a light one.
  // This is what makes a nose-heavy car understeer rather than spin, and the
  // model is unstable without it.
  var LOAD_EXP = 0.80;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  // Normalised so an evenly balanced axle (0.5) is unchanged.
  function loadGrip(load) { return Math.pow(clamp(load, 0.01, 0.99), LOAD_EXP) / Math.pow(0.5, LOAD_EXP) * 0.5; }
  function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
  function approach(cur, target, rate, dt) {
    var d = target - cur, m = rate * dt;
    return Math.abs(d) <= m ? target : cur + sign(d) * m;
  }

  /* Surfaces scale available grip. Rain multiplies on top, so a wet kerb is
     worse than either alone. */
  var SURFACES = {
    road:   { grip: 1.00, roll: 1.00 },
    kerb:   { grip: 0.82, roll: 1.45 },
    grass:  { grip: 0.46, roll: 3.10 },
    gravel: { grip: 0.58, roll: 2.40 },
    ice:    { grip: 0.22, roll: 0.90 }
  };
  var WEATHER = { dry: 1.00, wet: 0.80, rain: 0.68 };

  /* Difficulty changes assistance only. It never edits forces directly: a
     Beginner car obeys the same equations, it just receives gentler inputs and
     recovers from a slide faster. */
  var DIFFICULTY = {
    beginner: { steerAssist: 0.70, counterAssist: 0.55, recovery: 1.70, throttleSmooth: 7.0 },
    standard: { steerAssist: 0.35, counterAssist: 0.28, recovery: 1.25, throttleSmooth: 9.5 },
    expert:   { steerAssist: 0.00, counterAssist: 0.00, recovery: 1.00, throttleSmooth: 14.0 }
  };

  function createState(car, opts) {
    opts = opts || {};
    return {
      x: opts.x || 0, y: opts.y || 0,          // world position, metres
      heading: opts.heading || 0,               // radians, 0 = +x
      vx: 0, vy: 0,                             // body frame: vx forward, vy left
      yawRate: 0,
      rpm: car.idleRpm,
      gear: 1,
      shiftWait: 0,
      wheelspin: 0,                             // 0..1, how much drive is lost
      loadF: 0.5, loadR: 0.5,                   // normalised axle loads
      slipF: 0, slipR: 0,                       // slip angles, radians
      steer: 0,                                 // current road-wheel angle
      throttle: 0, brake: 0, handbrake: 0,
      surfaceF: "road", surfaceR: "road",
      boost: 0,
      tick: 0,
      distance: 0
    };
  }

  /* Tyre lateral force against slip angle: linear to a peak, then a controlled
     falloff so the car breaks away progressively instead of snapping. Returns a
     normalised force in roughly [-1, 1] before load and grip are applied. */
  function tyreForce(slip, peakSlip, falloff) {
    var a = Math.abs(slip);
    var f;
    if (a <= peakSlip) {
      f = Math.sin((a / peakSlip) * (Math.PI / 2));
    } else {
      // Past the peak, grip decays toward a plateau rather than to zero: a car
      // that is fully sideways still has some bite, which is what makes a long
      // drift controllable.
      var over = (a - peakSlip) / Math.max(0.001, falloff);
      f = 1 - 0.45 * (1 - Math.exp(-over));
    }
    return -sign(slip) * f;
  }

  /* Engine torque from a small curve, sampled linearly. */
  function torqueAt(car, rpm) {
    var pts = car.torqueCurve, n = pts.length;
    if (rpm <= pts[0][0]) return pts[0][1];
    if (rpm >= pts[n - 1][0]) return pts[n - 1][1];
    for (var i = 1; i < n; i++) {
      if (rpm <= pts[i][0]) {
        var a = pts[i - 1], b = pts[i];
        var t = (rpm - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return pts[n - 1][1];
  }

  /* One tick. `input` is {throttle, brake, steer, handbrake} with steer in
     [-1, 1]; `env` carries surface, weather and difficulty. */
  function step(state, car, input, env, dt) {
    env = env || {};
    var diff = DIFFICULTY[env.difficulty] || DIFFICULTY.standard;
    var weather = WEATHER[env.weather] || WEATHER.dry;
    var surfF = SURFACES[state.surfaceF] || SURFACES.road;
    var surfR = SURFACES[state.surfaceR] || SURFACES.road;
    var tune = car.tune || {};

    var mass = car.mass * (tune.weight || 1);
    var throttleIn = clamp(input.throttle || 0, 0, 1);
    var brakeIn = clamp(input.brake || 0, 0, 1);
    var handbrake = clamp(input.handbrake || 0, 0, 1);
    var steerIn = clamp(input.steer || 0, -1, 1);

    var speed = Math.hypot(state.vx, state.vy);
    var fwd = state.vx;

    // ---- 8. Assists, applied to the INPUT only -----------------------------
    // Guidance, never a teleport and never a hidden branch in the forces. The
    // car below this line does not know what difficulty it is on.
    if (diff.steerAssist > 0 && speed > 2) {
      // Nudge steering toward the angle that would unwind the current slide.
      // The stabilising input follows the SIGN of the rear slip: a rear sliding
      // one way is caught by steering the same way. Negating it, as an earlier
      // version did, steered further into the slide and made the assists make
      // things worse.
      var counter = clamp(state.slipR * 2.2, -1, 1);
      steerIn = steerIn + (counter - steerIn) * diff.counterAssist * clamp(Math.abs(state.slipR) / 0.35, 0, 1);
      // Fade steering lock at speed so a full-lock input cannot spin the car.
      steerIn *= 1 - diff.steerAssist * clamp((speed - 10) / 40, 0, 0.55);
    }

    // ---- Steering: the road wheels move at a finite rate --------------------
    // Full lock is only meaningful when parking. Above walking pace the useful
    // steering angle is set by grip, not by the rack: a steady turn of radius
    // L/d at speed v demands v*v*d/L of lateral acceleration, and the tyres only
    // have about 1g to give. An earlier version scaled lock by a flat 1/(1+kv),
    // which still asked for 2g at ordinary cornering speeds -- so every car slid
    // in every test and no amount of yaw damping could fix it.
    var gripLimited = (car.steerAuthority * G * car.wheelbase) / Math.max(speed * speed, 1);
    var maxUseful = Math.min(car.maxSteer, gripLimited);
    // A margin above the grip-limited angle, so a deliberate overdrive can still
    // provoke a slide. Without it the car could never be made to oversteer.
    var targetSteer = steerIn * Math.min(car.maxSteer, maxUseful * car.steerMargin);
    targetSteer *= 1 / (1 + speed * car.steerFalloff * 0.25);
    state.steer = approach(state.steer, targetSteer, car.steerRate, dt);

    // ---- 1. World velocity is already held in the body frame ---------------
    // (integration below rotates it, so no transform is needed here)

    // ---- 2. Slip angles -----------------------------------------------------
    // Below a speed floor the arctangents are noise, so they are zeroed.
    if (speed > SPEED_FLOOR) {
      state.slipF = Math.atan2(state.vy + state.yawRate * car.frontAxle, Math.abs(fwd) + 0.0001) - state.steer * sign(fwd || 1);
      state.slipR = Math.atan2(state.vy - state.yawRate * car.rearAxle, Math.abs(fwd) + 0.0001);
    } else {
      state.slipF = 0; state.slipR = 0;
    }

    // ---- 3. Axle loads and longitudinal transfer ----------------------------
    var staticF = car.frontMassFraction;
    var accelEst = (state.lastAccel || 0);
    var transfer = clamp((accelEst * car.cgHeight) / (car.wheelbase * G), -0.32, 0.32);
    state.loadF = clamp(staticF - transfer, 0.12, 0.88);
    state.loadR = 1 - state.loadF;

    // ---- 5. Longitudinal force ----------------------------------------------
    // Engine speed follows wheel speed through the gearing.
    var wheelOmega = fwd / car.wheelRadius;
    var ratio = car.gearRatios[clamp(state.gear - 1, 0, car.gearRatios.length - 1)] * car.finalDrive;
    state.rpm = clamp(Math.abs(wheelOmega) * ratio * 60 / (2 * Math.PI), car.idleRpm, car.redline);

    // Automatic gearbox with a shift delay, so acceleration is not perfectly
    // smooth and short gears matter.
    state.shiftWait = Math.max(0, state.shiftWait - dt);
    if (state.shiftWait === 0) {
      if (state.rpm > car.redline * 0.95 && state.gear < car.gearRatios.length) { state.gear++; state.shiftWait = car.shiftDelay; }
      else if (state.rpm < car.idleRpm * 1.6 && state.gear > 1) { state.gear--; state.shiftWait = car.shiftDelay; }
    }

    // Turbo spools with throttle and decays without it.
    var boostTarget = throttleIn > 0.5 && state.rpm > car.boostThreshold ? car.maxBoost : 0;
    state.boost = approach(state.boost, boostTarget, car.spoolRate, dt);

    var driveTorque = torqueAt(car, state.rpm) * (1 + state.boost) * throttleIn * (tune.power || 1);
    var driveForce = (driveTorque * ratio * car.drivetrainEfficiency) / car.wheelRadius;

    // The friction circle. A tyre has one grip budget and cannot spend it twice:
    // what it uses driving is not available for cornering, and the other way
    // round. Capping only the longitudinal side left front-wheel drive able to
    // put full power down mid-corner, so it spun instead of pushing wide.
    var drivenLoad = car.drive === "fwd" ? state.loadF : car.drive === "awd" ? 1 : state.loadR;
    // All-wheel drive puts power down through both axles, so its traction is the
    // load-weighted blend of the two surfaces. Reading only the rear meant an
    // AWD car with its front wheels on ice had full road traction, and one with
    // only its rear on ice was reduced to ice traction at all four corners.
    var drivenSurf = car.drive === "fwd" ? surfF.grip
                   : car.drive === "awd" ? surfF.grip * state.loadF + surfR.grip * state.loadR
                   : surfR.grip;
    var capacity = car.tireGrip * (tune.grip || 1) * drivenLoad * drivenSurf * weather * mass * G;

    if (driveForce > capacity) {
      state.wheelspin = clamp((driveForce - capacity) / Math.max(1, driveForce), 0, 1);
      driveForce = capacity + (driveForce - capacity) * 0.18; // spinning tyres still push a little
    } else {
      state.wheelspin = approach(state.wheelspin, 0, 3, dt);
    }
    // Fraction of the driven axle's grip now committed to acceleration. The
    // lateral pass below multiplies that axle's grip by what is left.
    // A spinning tyre keeps some lateral bite. Letting the term reach zero made
    // a powerful rear-drive car spin the instant it used full throttle in a
    // corner, which is not recoverable and not fun; the floor keeps power
    // oversteer without turning every throttle stab into a spin.
    var used = capacity > 1 ? clamp(Math.abs(driveForce) / capacity, 0, 0.985) : 0;
    var lateralLeft = Math.max(0.40, Math.sqrt(1 - used * used));
    var leftFront = car.drive === "fwd" ? lateralLeft : car.drive === "awd" ? 0.5 + lateralLeft * 0.5 : 1;
    var leftRear  = car.drive === "rwd" ? lateralLeft : car.drive === "awd" ? 0.5 + lateralLeft * 0.5 : 1;

    // Braking opposes motion and is clamped at a standstill below. Brakes can
    // always lock the wheels, so what actually stops the car is the friction
    // available at both axles — which is why rain lengthens a stop. Without this
    // cap the brakes were equally effective on ice and dry tarmac.
    var brakeForce = brakeIn * car.brakeForce + handbrake * car.handbrakeForce;
    var brakeGrip = car.tireGrip * (tune.grip || 1) * weather * mass * G *
                    (surfF.grip * state.loadF + surfR.grip * state.loadR);
    brakeForce = Math.min(brakeForce, brakeGrip);
    var longAccel = (driveForce - sign(fwd) * brakeForce) / mass;

    // Drag and rolling resistance.
    var drag = car.dragCoeff * speed * speed * sign(fwd);
    var roll = car.rollResist * fwd * ((surfF.roll + surfR.roll) / 2);
    longAccel -= (drag + roll) / mass;

    // ---- 4. Lateral forces --------------------------------------------------
    var gripScale = weather * (tune.grip || 1) * (car.tireGrip || 1);
    var peakF = car.peakSlip;
    var peakR = car.peakSlip;

    var latF = tyreForce(state.slipF, peakF, car.slipFalloff) *
               car.gripFront * loadGrip(state.loadF) * surfF.grip * gripScale * leftFront;
    // Stability assistance is REAR grip, and only rear grip. Adding grip at both
    // ends made a forgiving car corner harder and therefore rotate harder, so
    // "beginner" span more readily than "expert"; holding the rear is what
    // actually stops a spin.
    var rearGrip = car.gripRear * loadGrip(state.loadR) * surfR.grip * gripScale * leftRear * diff.recovery;
    // ---- 6. Handbrake: the rear locks, the front keeps steering -------------
    if (handbrake > 0) rearGrip *= 1 - handbrake * clamp(car.handbrakeRelease * (tune.handbrake || 1), 0, 0.92);
    var latR = tyreForce(state.slipR, peakR, car.slipFalloff) * rearGrip;

    // Tyre forces in newtons: a normalised force is a fraction of the weight
    // carried by that axle.
    var forceF = latF * mass * G;
    var forceR = latR * mass * G;

    // ---- 7. Integrate -------------------------------------------------------
    var latAccel = (forceF + forceR) / mass;
    // Yaw inertia about the centre of mass. A car's radius of gyration is close
    // to half its wheelbase; `yawInertia` scales that per car. Dividing a moment
    // (N·m) by kg·m² gives rad/s², which is what the integrator needs — an
    // earlier version divided accelerations by a bare scalar and the resulting
    // yaw rate was large enough to spin every car on corner entry.
    var radius = car.wheelbase * 0.5;
    var izz = mass * car.yawInertia * radius * radius;
    var yawMoment = (forceF * car.frontAxle - forceR * car.rearAxle) / izz;

    state.lastAccel = longAccel;

    // Semi-implicit Euler: velocity first, then position from the new velocity.
    var vxBefore = state.vx;
    state.vx += longAccel * dt;
    // Brakes stop a car; they do not drive it backwards. Without this clamp the
    // integrator carried vx through zero every tick and the car jittered around
    // a standstill, flipping sign about half the time.
    if (brakeIn > 0 && driveForce <= 0.001 && vxBefore !== 0 && sign(state.vx) !== sign(vxBefore)) {
      state.vx = 0;
    }
    state.vy += latAccel * dt;
    state.yawRate += yawMoment * dt;

    // The body frame rotates, so lateral velocity bleeds into forward velocity.
    var dHeading = state.yawRate * dt;
    var cos = Math.cos(dHeading), sin = Math.sin(dHeading);
    var nvx = state.vx * cos + state.vy * sin;
    var nvy = -state.vx * sin + state.vy * cos;
    state.vx = nvx; state.vy = nvy;

    // The rear slip angle already carries a -yawRate*rearAxle/speed term that
    // opposes rotation, but that self-damping disappears once both tyres pass
    // their peak: a saturated car has no restoring moment left and spins
    // forever. This term stands in for the tyre relaxation and suspension
    // effects a two-tyre model leaves out. With the steering limiter in place
    // the car is stable at any value here, so it is set for feel: low enough to
    // keep turn-in sharp and handbrake drifts long.
    state.yawRate *= 1 - clamp(car.yawDamping * dt, 0, 0.35);

    // Below walking pace with no throttle, settle rather than creep forever.
    if (Math.abs(state.vx) < 0.25 && throttleIn === 0) { state.vx *= 0.82; state.vy *= 0.82; state.yawRate *= 0.8; }

    state.heading += dHeading;
    state.x += (state.vx * Math.cos(state.heading) - state.vy * Math.sin(state.heading)) * dt;
    state.y += (state.vx * Math.sin(state.heading) + state.vy * Math.cos(state.heading)) * dt;
    state.distance += Math.abs(state.vx) * dt;
    state.throttle = throttleIn; state.brake = brakeIn; state.handbrake = handbrake;
    state.tick++;
    return state;
  }

  /* Speed in km/h, for HUD and scoring only. */
  function kph(state) { return Math.hypot(state.vx, state.vy) * 3.6; }

  /* How sideways the car is, in radians. Drift scoring reads this. */
  function driftAngle(state) {
    if (Math.hypot(state.vx, state.vy) < 2) return 0;
    return Math.atan2(state.vy, Math.abs(state.vx));
  }

  /* A compact snapshot for replay checkpoints and hashing. Rounded, because
     two engines may differ in the last bit of a float and a checkpoint must not
     fail over that. */
  function snapshot(state) {
    var r = function (v) { return Math.round(v * 1000) / 1000; };
    return {
      tick: state.tick,
      x: r(state.x), y: r(state.y), heading: r(state.heading),
      vx: r(state.vx), vy: r(state.vy), yawRate: r(state.yawRate)
    };
  }

  return {
    VERSION: VERSION,
    G: G,
    SURFACES: SURFACES,
    WEATHER: WEATHER,
    DIFFICULTY: DIFFICULTY,
    createState: createState,
    step: step,
    tyreForce: tyreForce,
    torqueAt: torqueAt,
    kph: kph,
    driftAngle: driftAngle,
    snapshot: snapshot,
    clamp: clamp
  };
});
