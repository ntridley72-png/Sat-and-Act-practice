/* AI drivers: deterministic, control-only, and able to actually get round. */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const AI = require(path.join(__dirname, "..", "racing", "game", "ai.js"));
const Physics = require(path.join(__dirname, "..", "racing", "core", "vehicle-physics.js"));
const FixedStep = require(path.join(__dirname, "..", "racing", "core", "fixed-step.js"));
const Cars = require(path.join(__dirname, "..", "racing", "data", "cars.js"));

/* A closed oval: two straights joined by constant-radius ends. Good enough to
   exercise braking for curvature and getting back on the throttle. */
function oval(radius = 70, straight = 160, half = 7) {
  const arc = Math.PI * radius;
  const length = 2 * straight + 2 * arc;
  return {
    length, half,
    at(d) {
      d = ((d % length) + length) % length;
      if (d < straight) return { x: d, y: 0, heading: 0, curvature: 0, half };
      d -= straight;
      if (d < arc) {
        const a = d / radius;
        return { x: straight + Math.sin(a) * radius, y: radius - Math.cos(a) * radius,
                 heading: a, curvature: 1 / radius, half };
      }
      d -= arc;
      if (d < straight) return { x: straight - d, y: 2 * radius, heading: Math.PI, curvature: 0, half };
      d -= straight;
      const a = d / radius;
      return { x: -Math.sin(a) * radius, y: 2 * radius - (radius - Math.cos(a) * radius),
               heading: Math.PI + a, curvature: 1 / radius, half };
    }
  };
}

function race(opts = {}) {
  const line = opts.line || oval();
  const car = Cars.get(opts.carId || "sport");
  const n = opts.count == null ? 1 : opts.count;
  const drivers = [], states = [];
  for (let i = 0; i < n; i++) {
    const start = line.at(i * 12);
    drivers.push(AI.create({ line, car, skill: opts.skill || "medium", seed: opts.seed || "race", id: "ai" + i, startDistance: i * 12 }));
    states.push(Physics.createState(car, { x: start.x, y: start.y, heading: start.heading }));
  }
  const env = { difficulty: "expert", weather: opts.weather || "dry" };
  const ticks = Math.round((opts.seconds || 30) / FixedStep.STEP);
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < n; i++) {
      const control = drivers[i].control(states[i], states, FixedStep.STEP);
      Physics.step(states[i], car, control, env, FixedStep.STEP);
    }
  }
  return { drivers, states, line };
}

test("an AI car completes meaningful distance without leaving the road", () => {
  const { drivers, states, line } = race({ seconds: 40 });
  const s = states[0];
  assert.ok(s.distance > 300, `the AI barely moved: ${s.distance.toFixed(0)}m in 40s`);
  assert.ok(isFinite(s.x) && isFinite(s.y), "the AI left the number line");
  // It should still be near the line it was following.
  const p = line.at(drivers[0].progress);
  const off = Math.hypot(p.x - s.x, p.y - s.y);
  assert.ok(off < line.half * 3, `the AI wandered ${off.toFixed(1)}m from the racing line`);
});

test("the AI never teleports: every step is consistent with its speed", () => {
  const line = oval();
  const car = Cars.get("sport");
  const driver = AI.create({ line, car, skill: "hard", seed: "jump" });
  const state = Physics.createState(car, line.at(0));
  let prev = { x: state.x, y: state.y };
  for (let t = 0; t < 1800; t++) {
    Physics.step(state, car, driver.control(state, [state], FixedStep.STEP), { difficulty: "expert", weather: "dry" }, FixedStep.STEP);
    const moved = Math.hypot(state.x - prev.x, state.y - prev.y);
    const possible = Math.hypot(state.vx, state.vy) * FixedStep.STEP + 0.05;
    assert.ok(moved <= possible, `the AI moved ${moved.toFixed(3)}m in one tick but could only cover ${possible.toFixed(3)}m`);
    prev = { x: state.x, y: state.y };
  }
});

test("the AI only ever produces in-range controls", () => {
  const line = oval();
  const car = Cars.get("hyper");
  const driver = AI.create({ line, car, skill: "hard", seed: "range" });
  const state = Physics.createState(car, line.at(0));
  for (let t = 0; t < 1200; t++) {
    const c = driver.control(state, [state], FixedStep.STEP);
    assert.ok(c.throttle >= 0 && c.throttle <= 1, `throttle ${c.throttle}`);
    assert.ok(c.brake >= 0 && c.brake <= 1, `brake ${c.brake}`);
    assert.ok(c.steer >= -1 && c.steer <= 1, `steer ${c.steer}`);
    assert.ok(c.handbrake >= 0 && c.handbrake <= 1, `handbrake ${c.handbrake}`);
    Physics.step(state, car, c, { difficulty: "expert", weather: "dry" }, FixedStep.STEP);
  }
});

test("the same seed produces the same race, twice", () => {
  const a = race({ seconds: 25, count: 3, seed: "repeat" });
  const b = race({ seconds: 25, count: 3, seed: "repeat" });
  a.states.forEach((s, i) => assert.deepEqual(Physics.snapshot(s), Physics.snapshot(b.states[i]), `car ${i} diverged`));
});

test("a different seed produces a different race", () => {
  const a = race({ seconds: 25, count: 3, seed: "one" });
  const b = race({ seconds: 25, count: 3, seed: "two" });
  const same = a.states.every((s, i) => JSON.stringify(Physics.snapshot(s)) === JSON.stringify(Physics.snapshot(b.states[i])));
  assert.ok(!same, "two seeds produced an identical race");
});

test("the AI brakes for a corner instead of carrying straight-line speed into it", () => {
  const line = oval(45, 200);
  const car = Cars.get("sport");
  const driver = AI.create({ line, car, skill: "hard", seed: "brake" });
  const state = Physics.createState(car, line.at(0));
  let onStraight = 0, inCorner = Infinity, braked = 0, brakedOnStraight = 0;
  for (let t = 0; t < 2400; t++) {
    const c = driver.control(state, [state], FixedStep.STEP);
    Physics.step(state, car, c, { difficulty: "expert", weather: "dry" }, FixedStep.STEP);
    const p = line.at(driver.progress);
    const kph = Physics.kph(state);
    if (c.brake > 0.05) { braked++; if (Math.abs(p.curvature) < 1e-6) brakedOnStraight++; }
    if (Math.abs(p.curvature) < 1e-6) onStraight = Math.max(onStraight, kph);
    else inCorner = Math.min(inCorner, kph);
  }
  assert.ok(onStraight > 60, `the AI never built speed on the straight (${onStraight.toFixed(0)} km/h)`);
  assert.ok(inCorner < onStraight * 0.92,
    `the AI did not slow for the corner: straight ${onStraight.toFixed(0)} vs corner ${inCorner.toFixed(0)} km/h`);
  // It must actually use the brake, not just coast off the throttle, or it will
  // never be able to defend a late-braking line.
  assert.ok(braked > 30, `the AI hardly touched the brakes (${braked} ticks)`);
  assert.ok(brakedOnStraight > 0, "the AI should brake on the straight approaching the corner");
});

test("harder skill is faster than easier skill over the same time", () => {
  const easy = race({ seconds: 40, skill: "easy", seed: "s" }).states[0].distance;
  const hard = race({ seconds: 40, skill: "hard", seed: "s" }).states[0].distance;
  assert.ok(hard > easy, `hard (${hard.toFixed(0)}m) should cover more ground than easy (${easy.toFixed(0)}m)`);
});

test("a car steers around a rival directly ahead", () => {
  // The avoidance test has to put something in the way, or it passes whether or
  // not the AI avoids anything.
  const line = oval();
  const car = Cars.get("sport");
  const driver = AI.create({ line, car, skill: "medium", seed: "avoid" });
  const me = Physics.createState(car, Object.assign({}, line.at(0), { vx: 20 }));
  const blocker = Physics.createState(car, Object.assign({}, line.at(14), { vx: 2 }));

  let maxOffset = 0;
  for (let t = 0; t < 120; t++) {
    driver.control(me, [me, blocker], FixedStep.STEP);
    maxOffset = Math.max(maxOffset, Math.abs(driver.offset));
    Physics.step(me, car, driver.control(me, [me, blocker], FixedStep.STEP), { difficulty: "expert", weather: "dry" }, FixedStep.STEP);
  }
  assert.ok(maxOffset > 0.1, `the AI did not move off line for a car ahead (offset ${maxOffset.toFixed(3)})`);

  // With nothing ahead it should stay on the line instead.
  const clean = AI.create({ line, car, skill: "medium", seed: "avoid" });
  const alone = Physics.createState(car, Object.assign({}, line.at(0), { vx: 20 }));
  let soloOffset = 0;
  for (let t = 0; t < 120; t++) {
    clean.control(alone, [alone], FixedStep.STEP);
    soloOffset = Math.max(soloOffset, Math.abs(clean.offset));
    Physics.step(alone, car, clean.control(alone, [alone], FixedStep.STEP), { difficulty: "expert", weather: "dry" }, FixedStep.STEP);
  }
  assert.ok(maxOffset > soloOffset * 2,
    `avoiding (${maxOffset.toFixed(3)}) should move the car further off line than running alone (${soloOffset.toFixed(3)})`);
});

test("a field of cars does not pile into one another", () => {
  const { states } = race({ seconds: 35, count: 5, seed: "field" });
  let touching = 0;
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      if (Math.hypot(states[i].x - states[j].x, states[i].y - states[j].y) < 3) touching++;
    }
  }
  assert.equal(touching, 0, "AI cars ended the race overlapping each other");
  states.forEach((s, i) => assert.ok(s.distance > 200, `car ${i} stalled at ${s.distance.toFixed(0)}m`));
});

test("the AI copes with rain by going slower, not by spinning", () => {
  const dry = race({ seconds: 35, weather: "dry", seed: "w" }).states[0];
  const wet = race({ seconds: 35, weather: "rain", seed: "w" }).states[0];
  assert.ok(Math.abs(Physics.driftAngle(wet)) < 0.8, "the AI span in the rain");
  assert.ok(wet.distance > 150, "the AI gave up in the rain");
});
