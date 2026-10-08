/* Ghost recording, replay and tamper detection.

   A ghost stores the input a player gave, not the line the car took, so replay
   re-runs the simulation. These tests prove it reproduces exactly, compresses,
   and refuses anything that has been edited after the fact. */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Ghost = require(path.join(__dirname, "..", "racing", "game", "ghost.js"));
const Physics = require(path.join(__dirname, "..", "racing", "core", "vehicle-physics.js"));
const FixedStep = require(path.join(__dirname, "..", "racing", "core", "fixed-step.js"));
const Cars = require(path.join(__dirname, "..", "racing", "data", "cars.js"));

const META = { seed: "ghost-test", carId: "coupe90", trackId: "oval", weather: "dry", difficulty: "expert" };

// A repeatable lap: a function of tick only, so recording it twice is identical.
function inputAt(tick) {
  const t = tick / 60;
  return {
    throttle: t % 4 < 3 ? 0.85 : 0.2,
    brake: t % 4 >= 3.6 ? 0.8 : 0,
    steer: Math.sin(t * 0.9) * 0.55,
    handbrake: t % 7 > 6.6 ? 1 : 0
  };
}

function recordRun(ticks = 600, meta = META) {
  const car = Cars.get(meta.carId);
  const state = Physics.createState(car);
  const env = { difficulty: meta.difficulty, weather: meta.weather };
  const rec = Ghost.record(meta);
  for (let tick = 1; tick <= ticks; tick++) {
    // Quantised at the input layer, exactly as the live loop must do, so the
    // run that is simulated is the run that is recorded.
    const inp = Ghost.quantize(inputAt(tick));
    Physics.step(state, car, inp, env, FixedStep.STEP);
    rec.record(tick, inp, state);
  }
  return { ghost: rec.finish({ score: 1234 }), state };
}

test("replaying a ghost reproduces the run exactly", () => {
  const { ghost, state } = recordRun();
  const out = Ghost.replay(ghost, Cars);
  assert.deepEqual(Physics.snapshot(out.state), Physics.snapshot(state),
    "replay did not land on the same car as the original run");
});

test("a ghost verifies against itself", () => {
  const { ghost } = recordRun();
  const v = Ghost.verify(ghost, Cars);
  assert.equal(v.ok, true, v.reason);
});

test("inputs are stored as changes, not one entry per tick", () => {
  const { ghost } = recordRun(600);
  assert.ok(ghost.inputs.length < 600, "a change list must be shorter than the tick count");
  assert.ok(Ghost.size(ghost) < 60000, `a ten-second ghost should be small, got ${Ghost.size(ghost)} bytes`);
  // Holding one input for a long time must collapse to a single entry.
  const car = Cars.get("sport");
  const st = Physics.createState(car);
  const held = Ghost.record(META);
  const steady = Ghost.quantize({ throttle: 1, brake: 0, steer: 0, handbrake: 0 });
  for (let t = 1; t <= 300; t++) { Physics.step(st, car, steady, { difficulty: "expert", weather: "dry" }, FixedStep.STEP); held.record(t, steady, st); }
  assert.equal(held.finish().inputs.length, 1, "a held input must collapse to one entry");
});

test("checkpoints are produced at a steady cadence", () => {
  const { ghost } = recordRun(600);
  assert.equal(ghost.checkpoints.length, Math.floor(600 / Ghost.CHECKPOINT_EVERY));
  ghost.checkpoints.forEach((c, i) => assert.equal(c.tick, (i + 1) * Ghost.CHECKPOINT_EVERY));
});

test("quantising an already-quantised input changes nothing", () => {
  const once = Ghost.quantize({ throttle: 0.837, brake: 0, steer: -0.4449, handbrake: 1 });
  assert.deepEqual(Ghost.quantize(once), once, "quantisation must be idempotent");
  assert.deepEqual(Ghost.quantize({ throttle: 5, brake: -3, steer: 9, handbrake: 0.5 }),
    { throttle: 1, brake: 0, steer: 1, handbrake: 0.5 }, "out-of-range input must be clamped");
});

test("an edited input is caught", () => {
  const { ghost } = recordRun();
  const tampered = JSON.parse(JSON.stringify(ghost));
  // Rewrite the run to hold full throttle and never brake: the obvious forgery.
  tampered.inputs = tampered.inputs.map((e) => [e[0], 1, 0, e[3], e[4]]);
  const v = Ghost.verify(tampered, Cars);
  assert.equal(v.ok, false, "a rewritten throttle trace must not verify");
  assert.match(v.reason, /diverged|hash/, `unexpected rejection reason: ${v.reason}`);
});

test("the tolerance is tight enough to catch a cheat worth making", () => {
  // A single sub-millimetre nudge is below the checkpoint tolerance by design:
  // it costs the forger nothing and gains them nothing. What must be caught is
  // any edit large enough to change where the car ends up.
  const { ghost } = recordRun();
  const nudge = JSON.parse(JSON.stringify(ghost));
  nudge.inputs[10][3] = Number(Math.max(-1, Math.min(1, nudge.inputs[10][3] + 0.5)).toFixed(2));
  const v = Ghost.verify(nudge, Cars);
  assert.equal(v.ok, false, "a half-lock steering edit must be caught");

  // The hash chain, not the position tolerance, is what does the work here: the
  // snapshot is rounded to a millimetre, so any edit that moves the car at all
  // changes every hash from that point on. The position tolerance exists to
  // absorb last-bit float differences between engines, not to catch cheating.
  const out = Ghost.replay(nudge, Cars);
  const last = ghost.checkpoints[ghost.checkpoints.length - 1];
  const drift = Math.hypot(out.state.x - last.x, out.state.y - last.y);
  assert.ok(drift > 0.001, `the edit should move the car at all, moved ${drift.toFixed(4)}m`);
  assert.notEqual(out.chain, ghost.chain, "the hash chain must differ after any real edit");
});

test("an edited checkpoint is caught", () => {
  const { ghost } = recordRun();
  const tampered = JSON.parse(JSON.stringify(ghost));
  tampered.checkpoints[2].x += 25; // teleport a second of the run
  const v = Ghost.verify(tampered, Cars);
  assert.equal(v.ok, false, "a moved checkpoint must not verify");
});

test("a rewritten hash chain still fails, because the tail covers it", () => {
  const { ghost } = recordRun();
  const tampered = JSON.parse(JSON.stringify(ghost));
  tampered.checkpoints[1].x += 12;
  // Recompute only that one hash, as a naive forger would.
  tampered.checkpoints[1].h = Ghost.hash("whatever");
  const v = Ghost.verify(tampered, Cars);
  assert.equal(v.ok, false, "patching a single hash must not rescue the recording");
});

test("a run recorded under a different physics version is refused", () => {
  const { ghost } = recordRun();
  ghost.meta.physicsVersion = Physics.VERSION + 1;
  const v = Ghost.verify(ghost, Cars);
  assert.equal(v.ok, false);
  assert.match(v.reason, /physics version/);
});

test("a different car or weather produces a different run", () => {
  const { ghost } = recordRun();
  const otherCar = JSON.parse(JSON.stringify(ghost));
  otherCar.meta.carId = "muscle";
  assert.equal(Ghost.verify(otherCar, Cars).ok, false, "claiming a different car must not verify");

  const otherWeather = JSON.parse(JSON.stringify(ghost));
  otherWeather.meta.weather = "rain";
  assert.equal(Ghost.verify(otherWeather, Cars).ok, false, "claiming different weather must not verify");
});

test("malformed and implausible recordings are refused with a reason", () => {
  assert.equal(Ghost.verify(null, Cars).ok, false);
  assert.equal(Ghost.verify({}, Cars).ok, false);

  const { ghost } = recordRun();
  const tooLong = JSON.parse(JSON.stringify(ghost));
  tooLong.ticks = Ghost.MAX_TICKS + 1;
  assert.match(Ghost.verify(tooLong, Cars).reason, /length/);

  const outOfRange = JSON.parse(JSON.stringify(ghost));
  outOfRange.inputs[1][1] = 9;
  assert.match(Ghost.verify(outOfRange, Cars).reason, /out of range/);

  const nonMonotonic = JSON.parse(JSON.stringify(ghost));
  nonMonotonic.inputs[2][0] = nonMonotonic.inputs[1][0];
  assert.match(Ghost.verify(nonMonotonic, Cars).reason, /non-monotonic/);

  // One input change per tick is not something a human produces.
  const spam = { meta: ghost.meta, ticks: 300, checkpoints: [], chain: "x", summary: {},
    inputs: Array.from({ length: 300 }, (_, i) => [i + 1, 1, 0, (i % 2 ? 0.5 : -0.5), 0]) };
  assert.match(Ghost.verify(spam, Cars).reason, /input frequency/);
});

test("non-numeric and fractional values are rejected before they reach the physics", () => {
  // Found in cross-review: range checks alone let NaN through, because every
  // comparison against NaN is false, and JSON turns NaN into null.
  const { ghost } = recordRun();
  const bad = (mutate) => {
    const g = JSON.parse(JSON.stringify(ghost));
    mutate(g);
    return Ghost.verify(g, Cars);
  };

  assert.match(bad((g) => { g.inputs[0][1] = null; }).reason, /non-numeric/);
  assert.match(bad((g) => { g.inputs[0][1] = "1"; }).reason, /non-numeric/);
  assert.match(bad((g) => { g.inputs[0][3] = {}; }).reason, /non-numeric/);
  assert.match(bad((g) => { g.inputs.push([1.5, 1, 0, 0, 0]); }).reason, /fractional input tick/);
  assert.match(bad((g) => { g.ticks = "600"; }).reason, /length/);
  assert.match(bad((g) => { g.checkpoints[0].x = null; }).reason, /malformed checkpoint/);
  assert.match(bad((g) => { g.checkpoints[0] = 7; }).reason, /malformed checkpoint/);
  assert.match(bad((g) => { g.checkpoints[0].h = 42; }).reason, /malformed checkpoint/);

  // And the rejection must come from validation, not from the physics producing
  // a NaN that happens to fail a later comparison.
  const g2 = JSON.parse(JSON.stringify(ghost));
  g2.inputs[0][1] = null;
  g2.checkpoints = [];
  g2.chain = Ghost.hash("x");
  assert.match(Ghost.verify(g2, Cars).reason, /non-numeric/, "validation must run before replay");
});

test("playback can be stopped partway for a live ghost car", () => {
  const { ghost } = recordRun(600);
  const half = Ghost.replay(ghost, Cars, { untilTick: 300 });
  assert.equal(half.state.tick, 300);
  const full = Ghost.replay(ghost, Cars);
  assert.notDeepEqual(Physics.snapshot(half.state), Physics.snapshot(full.state));
});
