/* Fixed-timestep determinism.

   The acceptance criterion for the simulation foundation: a run rendered at 30,
   60 or 120 FPS, or at a deliberately irregular frame rate, must produce an
   identical car at an identical tick. Everything else — ghosts, replay hashes,
   server re-simulation — depends on this holding. */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FixedStep = require(path.join(__dirname, "..", "racing", "core", "fixed-step.js"));
const Physics = require(path.join(__dirname, "..", "racing", "core", "vehicle-physics.js"));
const Cars = require(path.join(__dirname, "..", "racing", "data", "cars.js"));
const Random = require(path.join(__dirname, "..", "racing", "core", "random.js"));

const car = Cars.get("sport");

// A fixed, repeatable input programme. It is a function of the tick number
// only, so every run of the same length sees exactly the same driving.
function inputAt(tick) {
  const t = tick / 60;
  return {
    throttle: t < 3 ? 1 : t < 5 ? 0.3 : 1,
    brake: t >= 5 && t < 5.6 ? 1 : 0,
    steer: Math.sin(t * 1.3) * 0.8,
    handbrake: t >= 6.2 && t < 6.7 ? 1 : 0
  };
}

// Run `seconds` of simulated time, feeding the clock frames of `frameTime`.
function run(seconds, frameTime) {
  const clock = FixedStep.create();
  const state = Physics.createState(car);
  const env = { difficulty: "expert", weather: "dry" };
  let elapsed = 0;
  while (clock.seconds() < seconds) {
    elapsed += frameTime;
    clock.advance(frameTime, (step, tick) => Physics.step(state, car, inputAt(tick), env, step));
    if (elapsed > seconds * 40) break; // guard against a stalled loop
  }
  return { clock, state };
}

test("the same tick count produces the same car at 30, 60 and 120 FPS", () => {
  const SECONDS = 8;
  const a = run(SECONDS, 1 / 30);
  const b = run(SECONDS, 1 / 60);
  const c = run(SECONDS, 1 / 120);

  assert.equal(a.clock.tick, b.clock.tick, "30 and 60 FPS must reach the same tick");
  assert.equal(b.clock.tick, c.clock.tick, "60 and 120 FPS must reach the same tick");

  const sa = Physics.snapshot(a.state), sb = Physics.snapshot(b.state), sc = Physics.snapshot(c.state);
  assert.deepEqual(sa, sb, "30 FPS and 60 FPS diverged");
  assert.deepEqual(sb, sc, "60 FPS and 120 FPS diverged");
});

test("an irregular frame rate still matches a steady one", () => {
  const steady = run(6, 1 / 60);

  // Frames that jitter the way a real browser's do.
  const clock = FixedStep.create();
  const state = Physics.createState(car);
  const env = { difficulty: "expert", weather: "dry" };
  const jitter = Random.create("frame-jitter");
  while (clock.tick < steady.clock.tick) {
    const frame = jitter.float(1 / 240, 1 / 45);
    clock.advance(frame, (step, tick) => {
      if (clock.tick > steady.clock.tick) return;
      Physics.step(state, car, inputAt(tick), env, step);
    });
  }
  assert.equal(clock.tick, steady.clock.tick);
  assert.deepEqual(Physics.snapshot(state), Physics.snapshot(steady.state), "jittered frames diverged from steady ones");
});

test("a long stall is capped instead of replayed", () => {
  const clock = FixedStep.create();
  let ticks = 0;
  clock.advance(600, () => ticks++); // ten minutes in a hidden tab
  assert.ok(ticks <= FixedStep.MAX_CATCHUP, `a stall ran ${ticks} ticks; the cap is ${FixedStep.MAX_CATCHUP}`);
  assert.ok(clock.dropped > 1000, "the discarded time should be recorded");
});

test("pausing owes no time on resume", () => {
  const clock = FixedStep.create();
  clock.advance(1, () => {});
  const atPause = clock.tick;
  clock.pause();
  let during = 0;
  clock.advance(30, () => during++);
  assert.equal(during, 0, "a paused clock must not advance");
  assert.equal(clock.tick, atPause);
  clock.resume();
  let after = 0;
  clock.advance(1 / 60, () => after++);
  assert.equal(after, 1, "resuming must not pay out the paused time");
});

test("tick numbering is monotonic and time comes from ticks, not the wall clock", () => {
  const clock = FixedStep.create();
  const seen = [];
  for (let i = 0; i < 50; i++) clock.advance(1 / 60, (step, tick) => seen.push(tick));
  for (let i = 1; i < seen.length; i++) assert.equal(seen[i], seen[i - 1] + 1, "ticks must not skip or repeat");
  assert.ok(Math.abs(clock.seconds() - clock.tick / 60) < 1e-9);
});

test("alpha stays in range for interpolation", () => {
  const clock = FixedStep.create();
  const rng = Random.create("alpha");
  for (let i = 0; i < 300; i++) {
    clock.advance(rng.float(0.001, 0.05), () => {});
    assert.ok(clock.alpha >= 0 && clock.alpha < 1, `alpha out of range: ${clock.alpha}`);
  }
});

test("a clock restores exactly from its own state", () => {
  const a = FixedStep.create();
  for (let i = 0; i < 37; i++) a.advance(1 / 60, () => {});
  const b = FixedStep.create().restore(a.state());
  assert.deepEqual(b.state(), a.state());
});
