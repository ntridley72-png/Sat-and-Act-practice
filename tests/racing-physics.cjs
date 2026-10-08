/* Vehicle model behaviour.

   These assert the things a player can feel: the car accelerates, brakes, grips,
   breaks away progressively, recovers, responds to the handbrake, transfers
   load, spins its wheels, loses grip in the rain, drives differently per
   drivetrain, and gets worse when tuned badly. */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Physics = require(path.join(__dirname, "..", "racing", "core", "vehicle-physics.js"));
const Cars = require(path.join(__dirname, "..", "racing", "data", "cars.js"));

const STEP = 1 / 60;
const NONE = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
const input = (o) => Object.assign({}, NONE, o);

/* Drive `car` for `seconds` with a constant or per-tick input. */
function drive(carId, seconds, inp, env, seed) {
  const car = Cars.get(carId);
  const state = seed ? Object.assign(Physics.createState(car), seed) : Physics.createState(car);
  const e = Object.assign({ difficulty: "expert", weather: "dry" }, env || {});
  const ticks = Math.round(seconds / STEP);
  for (let t = 0; t < ticks; t++) {
    Physics.step(state, car, typeof inp === "function" ? inp(t, state) : inp, e, STEP);
  }
  return state;
}
// A car already moving forward at `kph`, so tests do not have to accelerate first.
const rolling = (kph) => ({ vx: kph / 3.6 });

test("the car accelerates under throttle and stops under braking", () => {
  const go = drive("sport", 4, input({ throttle: 1 }));
  assert.ok(Physics.kph(go) > 60, `expected real acceleration, got ${Physics.kph(go).toFixed(1)} km/h`);
  assert.ok(go.distance > 20, "the car should have covered ground");

  const stop = drive("sport", 3, input({ brake: 1 }), null, rolling(100));
  assert.ok(Physics.kph(stop) < 12, `braking from 100 km/h left ${Physics.kph(stop).toFixed(1)} km/h`);
});

test("braking does not throw the car backwards", () => {
  const s = drive("sport", 5, input({ brake: 1 }), null, rolling(60));
  assert.ok(s.vx >= -1.5, `braking reversed the car to ${s.vx.toFixed(2)} m/s`);
});

test("below the grip limit, more steering turns the car more", () => {
  const a = drive("sport", 1.5, input({ throttle: 0.3, steer: 0.10 }), null, rolling(35));
  const b = drive("sport", 1.5, input({ throttle: 0.3, steer: 0.25 }), null, rolling(35));
  const c = drive("sport", 1.5, input({ throttle: 0.3, steer: 0.50 }), null, rolling(35));
  assert.ok(Math.abs(a.heading) > 0.05, "gentle steering did nothing");
  assert.ok(Math.abs(b.heading) > Math.abs(a.heading), "more steering must turn more");
  assert.ok(Math.abs(c.heading) > Math.abs(b.heading), "more steering must turn more");
});

test("the steering limiter keeps full lock usable at speed", () => {
  // Steering is limited toward what the tyres can actually deliver, so holding
  // full lock at 140 km/h still produces a corner rather than a spin, and the
  // road-wheel angle is a fraction of the parking-speed angle.
  const slow = drive("sport", 0.6, input({ steer: 1 }), null, rolling(12));
  const fast = drive("sport", 2.0, input({ throttle: 0.4, steer: 0.95 }), null, rolling(140));
  assert.ok(Math.abs(fast.steer) < Math.abs(slow.steer) * 0.35,
    `full lock at speed should be heavily limited: ${Math.abs(slow.steer).toFixed(3)} -> ${Math.abs(fast.steer).toFixed(3)}`);
  assert.ok(Math.abs(Physics.driftAngle(fast)) < 0.6, "full lock at speed must not spin the car");
  assert.ok(Math.abs(fast.yawRate) > 0.1, "the car must still turn at speed");
});

test("more steering turns the car more until the tyres saturate, then holds", () => {
  // Response must rise with input and then plateau. A collapse past the limit
  // would mean the car suddenly stops responding, which is the behaviour the
  // steering limiter exists to prevent.
  [35, 90, 140].forEach((speed) => {
    const yaws = [0.3, 0.5, 0.7, 0.95].map((steer) =>
      Math.abs(drive("sport", 1.5, input({ throttle: 0.35, steer }), null, rolling(speed)).yawRate));
    assert.ok(yaws[1] > yaws[0] && yaws[2] > yaws[1],
      `at ${speed} km/h response did not rise with input: ${yaws.map((y) => y.toFixed(3)).join(", ")}`);
    const peak = Math.max(...yaws);
    assert.ok(yaws[3] > peak * 0.85,
      `at ${speed} km/h full lock collapsed to ${yaws[3].toFixed(3)} from a peak of ${peak.toFixed(3)}`);
  });
});

test("peak cornering grip is in a believable range", () => {
  // A road car corners at roughly 0.8-1.1g. Far outside that and the whole
  // model is mis-scaled, however self-consistent it looks.
  let peak = 0;
  for (const steer of [0.2, 0.35, 0.5, 0.7]) {
    const s = drive("sport", 1.2, input({ throttle: 0.3, steer }), null, rolling(70));
    if (Math.abs(s.slipR) > 0.35) continue; // spinning, not cornering
    peak = Math.max(peak, Math.abs(s.yawRate) * Math.hypot(s.vx, s.vy));
  }
  const g = peak / Physics.G;
  assert.ok(g > 0.6 && g < 1.45, `peak cornering was ${g.toFixed(2)}g, which is not a road car`);
});

test("lateral tyre force peaks and then falls away instead of vanishing", () => {
  const peak = 0.17, falloff = 0.30;
  const atPeak = Math.abs(Physics.tyreForce(peak, peak, falloff));
  const past = Math.abs(Physics.tyreForce(peak * 3, peak, falloff));
  const small = Math.abs(Physics.tyreForce(peak * 0.3, peak, falloff));

  assert.ok(small < atPeak, "force must build up to the peak");
  assert.ok(past < atPeak, "force must fall off past the peak");
  assert.ok(past > atPeak * 0.4, "a fully sideways tyre must keep some bite, or drifts are uncontrollable");
  assert.ok(Physics.tyreForce(0.2, peak, falloff) < 0, "force must oppose the slip direction");
  assert.ok(Physics.tyreForce(-0.2, peak, falloff) > 0, "force must oppose the slip direction");
});

test("the handbrake breaks the rear away and the front keeps steering", () => {
  const start = rolling(80);
  const normal = drive("coupe90", 1.0, input({ throttle: 0.5, steer: 0.6 }), null, start);
  const yanked = drive("coupe90", 1.0, input({ throttle: 0.5, steer: 0.6, handbrake: 1 }), null, start);

  assert.ok(Math.abs(yanked.slipR) > Math.abs(normal.slipR) * 1.3,
    `the handbrake should raise rear slip: ${normal.slipR.toFixed(3)} -> ${yanked.slipR.toFixed(3)}`);
  assert.ok(Math.abs(Physics.driftAngle(yanked)) > Math.abs(Physics.driftAngle(normal)),
    "the handbrake should produce a bigger drift angle");
  assert.ok(Math.abs(yanked.steer) > 0.05, "the front wheels must still be steering during a handbrake slide");
});

test("a slide recovers when the driver straightens up", () => {
  const car = Cars.get("coupe90");
  const state = Object.assign(Physics.createState(car), rolling(85));
  const env = { difficulty: "expert", weather: "dry" };
  // Provoke a slide.
  for (let t = 0; t < 60; t++) Physics.step(state, car, input({ throttle: 0.6, steer: 0.9, handbrake: 1 }), env, STEP);
  const slid = Math.abs(state.slipR);
  assert.ok(slid > 0.1, `the car did not actually slide (rear slip ${slid.toFixed(3)})`);
  // Straighten and ease off.
  for (let t = 0; t < 150; t++) Physics.step(state, car, input({ throttle: 0.25, steer: 0 }), env, STEP);
  assert.ok(Math.abs(state.slipR) < slid * 0.5,
    `the slide did not recover: ${slid.toFixed(3)} -> ${Math.abs(state.slipR).toFixed(3)}`);
});

test("load transfers forward under braking and back under power", () => {
  const brake = drive("sport", 0.8, input({ brake: 1 }), null, rolling(90));
  assert.ok(brake.loadF > 0.56, `braking should load the front axle, got ${brake.loadF.toFixed(3)}`);

  const launch = drive("muscle", 0.8, input({ throttle: 1 }));
  assert.ok(launch.loadR > 0.42, `power should shift load rearward, got ${launch.loadR.toFixed(3)}`);
  assert.ok(Math.abs(brake.loadF + brake.loadR - 1) < 1e-9, "axle loads must sum to 1");
});

test("too much power for the grip available becomes wheelspin", () => {
  const torquey = drive("muscle", 0.5, input({ throttle: 1 }));
  assert.ok(torquey.wheelspin > 0.05, `a standing-start V8 should spin its wheels, got ${torquey.wheelspin.toFixed(3)}`);

  const cruising = drive("sport", 2, input({ throttle: 0.25 }), null, rolling(70));
  assert.ok(cruising.wheelspin < 0.05, "a light throttle at speed should not spin the wheels");
});

test("rain lengthens braking and makes the same corner slide more", () => {
  const start = rolling(100);
  const dry = drive("sport", 2.2, input({ brake: 1 }), { weather: "dry" }, start);
  const rain = drive("sport", 2.2, input({ brake: 1 }), { weather: "rain" }, start);
  assert.ok(Physics.kph(rain) > Physics.kph(dry) + 5,
    `rain must lengthen a stop: dry left ${Physics.kph(dry).toFixed(1)} km/h, rain left ${Physics.kph(rain).toFixed(1)}`);
  assert.ok(rain.distance > dry.distance, "rain must take more distance to shed the same speed");

  const corner = input({ throttle: 0.3, steer: 0.45 });
  const dryTurn = drive("sport", 2, corner, { weather: "dry" }, rolling(70));
  const wetTurn = drive("sport", 2, corner, { weather: "wet" }, rolling(70));
  const rainTurn = drive("sport", 2, corner, { weather: "rain" }, rolling(70));
  const slide = (s) => Math.abs(Physics.driftAngle(s));
  assert.ok(slide(wetTurn) > slide(dryTurn), "a wet corner must slide more than a dry one");
  assert.ok(slide(rainTurn) > slide(wetTurn), "rain must slide more than merely wet");
});

test("grass is much slower and more slippery than road", () => {
  const road = drive("sport", 2, input({ throttle: 1 }), null, rolling(60));
  const grass = drive("sport", 2, input({ throttle: 1 }), null, Object.assign(rolling(60), { surfaceF: "grass", surfaceR: "grass" }));
  assert.ok(Physics.kph(grass) < Physics.kph(road), "grass must cost speed");
});

test("power-on behaviour differs by drivetrain", () => {
  // Full throttle mid-corner: the driven axle spends its grip accelerating, so
  // front drive pushes wide and rear drive gets loose.
  const hard = input({ throttle: 1, steer: 0.45 });
  const fwd = drive("hatch", 2, hard, null, rolling(55));
  const rwd = drive("coupe90", 2, hard, null, rolling(55));
  const awd = drive("rally", 2, hard, null, rolling(55));

  assert.ok(Math.abs(fwd.slipF) >= Math.abs(fwd.slipR) * 0.9,
    "front-wheel drive must not oversteer on power");
  assert.ok(Math.abs(Physics.driftAngle(fwd)) < 0.2,
    "front-wheel drive must stay tidy on power");
  assert.ok(Math.abs(Physics.driftAngle(rwd)) > Math.abs(Physics.driftAngle(fwd)) * 3,
    `rear-wheel drive must get far looser on power: fwd ${(Physics.driftAngle(fwd) * 57.3).toFixed(1)} deg vs rwd ${(Physics.driftAngle(rwd) * 57.3).toFixed(1)} deg`);
  assert.ok(Math.abs(Physics.driftAngle(awd)) < Math.abs(Physics.driftAngle(rwd)),
    "all-wheel drive must stay tidier than rear-wheel drive on power");
  assert.ok(Physics.kph(awd) > Physics.kph(fwd),
    "all-wheel drive must put its power down better than front drive");
});

test("all three drivetrains stay controllable on a light throttle", () => {
  const gentle = input({ throttle: 0.25, steer: 0.4 });
  // Every car in the fleet, not just a sample: a car that spins on a light
  // throttle is unplayable regardless of how characterful it is meant to be.
  Cars.ORDER.forEach((id) => {
    const s = drive(id, 2.5, gentle, null, rolling(60));
    assert.ok(Math.abs(Physics.driftAngle(s)) < 0.25,
      `${id} span out on a light throttle (drift ${(Physics.driftAngle(s) * 57.3).toFixed(0)} degrees)`);
  });
});

test("the fleet is actually distinguishable, not reskins", () => {
  const results = Cars.ORDER.map((id) => ({
    id,
    speed: Physics.kph(drive(id, 6, input({ throttle: 1 }))),
    slide: Math.abs(drive(id, 1.2, input({ throttle: 0.7, steer: 0.85, handbrake: 1 }), null, rolling(85)).slipR)
  }));
  const speeds = results.map((r) => r.speed);
  const fastest = Math.max(...speeds), slowest = Math.min(...speeds);
  assert.ok(fastest > slowest * 1.25, `the fleet is too samey: ${slowest.toFixed(1)}-${fastest.toFixed(1)} km/h`);

  const slides = results.map((r) => r.slide);
  assert.ok(Math.max(...slides) > Math.min(...slides) * 1.5, "every car slides the same amount");

  // The hypercar must out-accelerate the starter, and the starter must not be last.
  const by = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.ok(by.hyper.speed > by.sport.speed, "the hypercar should be faster than the free starter");
  assert.ok(by.hyper.speed > by.hatch.speed, "the hypercar should be faster than the hatch");
});

test("difficulty changes assistance, not the equations", () => {
  const provoke = input({ throttle: 0.8, steer: 0.95, handbrake: 1 });
  const beginner = drive("coupe90", 1.2, provoke, { difficulty: "beginner" }, rolling(70));
  const expert = drive("coupe90", 1.2, provoke, { difficulty: "expert" }, rolling(70));
  assert.ok(Math.abs(beginner.slipR) < Math.abs(expert.slipR),
    `beginner should slide less: ${Math.abs(beginner.slipR).toFixed(3)} vs expert ${Math.abs(expert.slipR).toFixed(3)}`);

  // Expert is demanding but must still be drivable on a keyboard: a steady
  // throttle and smooth steering has to produce a lap, not a spin.
  const lap = drive("coupe90", 6, (t) => input({ throttle: 0.7, steer: Math.sin(t / 60 * 1.1) * 0.5 }),
    { difficulty: "expert" }, rolling(50));
  assert.ok(isFinite(lap.x) && isFinite(lap.y), "the car left the number line");
  assert.ok(Physics.kph(lap) > 30, `an expert car must keep moving, got ${Physics.kph(lap).toFixed(1)} km/h`);
  assert.ok(Math.abs(Physics.driftAngle(lap)) < 0.7,
    `smooth inputs must not spin an expert car (drift ${(Physics.driftAngle(lap) * 57.3).toFixed(0)} degrees)`);
});

test("bad tuning has visible consequences", () => {
  const car = Cars.get("sport");
  const corner = input({ throttle: 1, steer: 0.8 });

  const safe = Object.assign(Physics.createState(car), rolling(85));
  const bad = Object.assign(Physics.createState(car), rolling(85));
  const env = { difficulty: "expert", weather: "dry" };
  const tuned = Object.assign({}, car, { tune: { power: 1.4, grip: 0.7, weight: 0.7, handbrake: 1.4 } });

  for (let t = 0; t < 90; t++) {
    Physics.step(safe, car, corner, env, STEP);
    Physics.step(bad, tuned, corner, env, STEP);
  }
  assert.ok(Math.abs(bad.slipR) > Math.abs(safe.slipR),
    "a car tuned for maximum power and minimum grip must be less stable");
});

test("the state never goes non-finite, however it is abused", () => {
  const car = Cars.get("hyper");
  const state = Physics.createState(car);
  const env = { difficulty: "expert", weather: "rain" };
  for (let t = 0; t < 2000; t++) {
    Physics.step(state, car, {
      throttle: t % 7 < 3 ? 1 : 0,
      brake: t % 11 < 2 ? 1 : 0,
      steer: Math.sin(t) * (t % 13 < 4 ? 1 : -1),
      handbrake: t % 17 < 3 ? 1 : 0
    }, env, STEP);
  }
  ["x", "y", "heading", "vx", "vy", "yawRate", "slipF", "slipR", "loadF", "rpm"].forEach((k) => {
    assert.ok(isFinite(state[k]), `${k} went non-finite: ${state[k]}`);
  });
});

test("all-wheel drive reads both surfaces, not just the rear", () => {
  // Found in cross-review: AWD traction used only the rear surface, so a car
  // with its front wheels on ice had full road traction.
  const both = drive("rally", 2, input({ throttle: 1 }), null, Object.assign(rolling(60), { surfaceF: "road", surfaceR: "road" }));
  const frontIce = drive("rally", 2, input({ throttle: 1 }), null, Object.assign(rolling(60), { surfaceF: "ice", surfaceR: "road" }));
  const rearIce = drive("rally", 2, input({ throttle: 1 }), null, Object.assign(rolling(60), { surfaceF: "road", surfaceR: "ice" }));

  assert.ok(Physics.kph(frontIce) < Physics.kph(both),
    "ice under the front wheels must cost an AWD car traction");
  assert.ok(Physics.kph(rearIce) < Physics.kph(both),
    "ice under the rear wheels must cost an AWD car traction");
  // Neither axle may be ignored, so neither split may match clean road.
  assert.ok(Math.abs(Physics.kph(frontIce) - Physics.kph(both)) > 0.5);
  assert.ok(Math.abs(Physics.kph(rearIce) - Physics.kph(both)) > 0.5);
});

test("braking settles at a standstill instead of jittering through zero", () => {
  // Found in cross-review: the integrator carried vx through zero every tick,
  // so a stopped car flipped sign about half the time.
  const car = Cars.get("sport");
  const state = Object.assign(Physics.createState(car), { vx: 2 });
  const env = { difficulty: "expert", weather: "dry" };
  const seen = [];
  for (let t = 0; t < 60; t++) {
    Physics.step(state, car, input({ brake: 1 }), env, STEP);
    seen.push(state.vx);
  }
  const flips = seen.slice(1).filter((v, i) => Math.sign(v) !== Math.sign(seen[i]) && v !== 0 && seen[i] !== 0).length;
  assert.ok(flips <= 1, `the car changed direction ${flips} times while braking to a stop`);
  assert.ok(Math.min(...seen) >= -0.01, `braking drove the car backwards to ${Math.min(...seen).toFixed(4)} m/s`);
  assert.ok(Math.abs(state.vx) < 0.01, "the car should end at rest");
});

test("legacy garages keep every car they unlocked", () => {
  const migrated = Cars.migrateUnlocks(["sport", "gti", "hatch", "popup", "coupe90", "square", "muscle"]);
  assert.ok(migrated.includes("sport"));
  assert.ok(migrated.includes("hatch"), "the old hatch and GTI both map to the hatch");
  assert.ok(migrated.includes("coupe90"), "the pop-up coupe maps onto the classic coupe");
  assert.ok(migrated.includes("muscle"), "the square sedan maps onto the muscle car");
  // Duplicate mappings unlock once, not once per legacy id.
  assert.equal(new Set(migrated).size, migrated.length, "a mapped car must not be unlocked twice");
  assert.equal(Cars.migrateSelection("gti"), "hatch");
  assert.equal(Cars.migrateSelection("nonsense"), "sport", "an unknown car falls back to the starter");
  assert.ok(Cars.migrateUnlocks([]).includes("sport"), "the starter is always owned");
});

test("every launch car has the figures the model reads", () => {
  assert.equal(Cars.ORDER.length, 10, "the launch fleet is ten cars");
  Cars.ORDER.forEach((id) => {
    const c = Cars.get(id);
    ["mass", "frontAxle", "rearAxle", "wheelbase", "gripFront", "gripRear", "maxSteer", "brakeForce"].forEach((k) => {
      assert.ok(isFinite(c[k]) && c[k] > 0, `${id}.${k} is missing or not positive`);
    });
    assert.ok(["fwd", "rwd", "awd"].includes(c.drive), `${id} has no valid drivetrain`);
    assert.ok(c.frontMassFraction > 0.3 && c.frontMassFraction < 0.75, `${id} has an implausible weight split`);
    assert.ok(c.torqueCurve.length >= 3, `${id} needs a real torque curve`);
    assert.ok(c.name && !/^(bmw|honda|toyota|nissan|ford|mazda|subaru|porsche|ferrari)/i.test(c.name),
      `${id} must have a fictional name`);
  });
});
