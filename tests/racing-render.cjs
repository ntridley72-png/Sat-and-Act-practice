/* The renderer.
 *
 * The load-bearing claim is that graphics tiers change visual work only. If it
 * is not true, a run recorded on a low-end Chromebook replays differently on a
 * desktop, every ghost desyncs and every leaderboard time is meaningless. So
 * the central test here drives the same input log through the same simulation
 * with each tier rendering beside it, and asserts the resulting physics is
 * identical to the last bit.
 *
 * The rest check that the renderer draws without a real browser (it is handed a
 * recording 2D context), that it never writes to a state it was given, that the
 * camera interpolates and damps as intended, and -- the one explicit design
 * constraint -- that nothing opaque is ever drawn spanning the road above it.
 */
const test = require("node:test");
const assert = require("node:assert");

const Renderer = require("../racing/render/renderer.js");
const Camera = require("../racing/render/camera.js");
const RenderTrack = require("../racing/render/track.js");
const RenderCar = require("../racing/render/car.js");
const EffectsMod = require("../racing/render/effects.js");
const Tracks = require("../racing/data/tracks.js");
const Cars = require("../racing/data/cars.js");
const Physics = require("../racing/core/vehicle-physics.js");
const FixedStep = require("../racing/core/fixed-step.js");
const Random = require("../racing/core/random.js");

/* A 2D context that records what it was asked to do instead of drawing it.
   Enough of the API for the renderer to run, and a log to assert against. */
function recorder() {
  const calls = [];
  const polys = [];
  let current = null;
  const ctx = {
    canvas: { width: 1440, height: 900 },
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, globalAlpha: 1,
    font: "", textAlign: "left", textBaseline: "alphabetic", filter: "none",
    shadowColor: "", shadowBlur: 0,
    calls, polys,
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    beginPath() { current = []; calls.push(["beginPath"]); },
    moveTo(x, y) { if (current) current.push([x, y]); },
    lineTo(x, y) { if (current) current.push([x, y]); },
    closePath() {},
    arcTo() {},
    arc() { calls.push(["arc"]); },
    ellipse() { calls.push(["ellipse"]); },
    quadraticCurveTo(a, b, x, y) { if (current) current.push([x, y]); },
    rect(x, y, w, h) { current = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; },
    clip() {},
    fill() {
      calls.push(["fill", String(ctx.fillStyle), ctx.globalAlpha]);
      if (current && current.length >= 3) polys.push({ pts: current.map((p) => p.slice()), style: String(ctx.fillStyle), alpha: ctx.globalAlpha });
    },
    stroke() { calls.push(["stroke", String(ctx.strokeStyle)]); },
    fillRect(x, y, w, h) {
      calls.push(["fillRect", x, y, w, h, String(ctx.fillStyle)]);
      polys.push({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], style: String(ctx.fillStyle), alpha: ctx.globalAlpha, rect: true });
    },
    fillText(t, x, y) { calls.push(["fillText", String(t), x, y]); },
    translate() {}, rotate() {}, scale() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    measureText(t) { return { width: String(t).length * 7 }; }
  };
  return ctx;
}

function world(opts = {}) {
  const track = Tracks.get(opts.track || "oval", { weather: opts.weather || "dry" });
  const car = Cars.get(opts.car || "sport");
  const state = Physics.createState(car, track.start);
  return { track, car, state };
}

/* A fixed, deliberately demanding input log: full throttle, some steering, a
   handbrake pull, so the car is sliding for part of it and the effects system
   is actually producing particles. */
function inputAt(tick) {
  const t = tick / 60;
  return {
    throttle: t < 1 ? 1 : 0.85,
    brake: t > 7 && t < 7.6 ? 0.8 : 0,
    steer: Math.sin(t * 0.7) * 0.7,
    handbrake: t > 4.2 && t < 5.0 ? 1 : 0
  };
}

// --------------------------------------------------------------------------
// The one that matters
// --------------------------------------------------------------------------

/* Run the simulation for `seconds`, rendering every frame at `tier`, and return
   the physics snapshot at the end. If tiers leak into the simulation, these
   disagree. */
function runWithRenderer(tier, seconds = 10, opts = {}) {
  const { track, car, state } = world(opts);
  const ctx = recorder();
  const r = Renderer.create({ tier, seed: "fixed", camera: opts.camera || "chase" });
  const clock = FixedStep.create();
  const env = { difficulty: "standard", weather: track.weather, surface: "road" };
  const frames = Math.round(seconds * 60);
  let hint = 0;
  for (let f = 0; f < frames; f++) {
    // One tick per frame keeps the comparison exact; the fixed-step clock's own
    // behaviour across frame rates is tests/racing-fixed-step.cjs's job.
    clock.advance(FixedStep.STEP, (step, tick) => {
      hint = track.nearest(state.x, state.y, hint).distance;
      env.surface = track.surfaceAt(state.x, state.y, hint);
      state.surfaceF = env.surface;
      state.surfaceR = env.surface;
      r.recordTick(state, []);
      Physics.step(state, car, inputAt(tick), env, step);
    });
    r.render({
      ctx, width: 1440, height: 900, track, car, state,
      rivals: [], alpha: clock.alpha, dt: FixedStep.STEP,
      look: { paint: "teal" }, env, hud: { title: "test", score: 1234 }
    });
  }
  return { snap: Physics.snapshot(state), ctx, renderer: r, track, car, state };
}

test("the simulation is bit-identical across every graphics tier", () => {
  const low = runWithRenderer("low");
  const medium = runWithRenderer("medium");
  const high = runWithRenderer("high");
  assert.deepStrictEqual(medium.snap, low.snap, "medium tier changed the simulation");
  assert.deepStrictEqual(high.snap, low.snap, "high tier changed the simulation");
  // And every field, not just the rounded snapshot.
  for (const k of ["x", "y", "heading", "vx", "vy", "yawRate", "rpm", "gear", "wheelspin", "slipF", "slipR", "steer", "distance", "tick"]) {
    assert.strictEqual(high.state[k], low.state[k], `tier changed state.${k}`);
  }
});

test("the tiers really are doing different amounts of work", () => {
  // Otherwise the test above would pass trivially because nothing is tiered.
  const low = runWithRenderer("low", 3);
  const high = runWithRenderer("high", 3);
  assert.ok(high.ctx.calls.length > low.ctx.calls.length * 1.3,
    `high tier issued ${high.ctx.calls.length} calls, low ${low.ctx.calls.length}`);
});

test("the camera mode does not reach the simulation either", () => {
  const chase = runWithRenderer("high", 6, { camera: "chase" });
  const hood = runWithRenderer("high", 6, { camera: "hood" });
  assert.deepStrictEqual(hood.snap, chase.snap);
});

test("the renderer never writes to the state it is given", () => {
  const { track, car, state } = world();
  const before = JSON.stringify(state);
  const r = Renderer.create({ tier: "high", seed: "s" });
  r.recordTick(state, []);
  r.render({
    ctx: recorder(), width: 1280, height: 720, track, car, state,
    rivals: [], alpha: 0.5, dt: 1 / 60, look: { paint: "red" },
    env: { weather: "dry", difficulty: "standard" }, hud: {}
  });
  assert.strictEqual(JSON.stringify(state), before);
});

// --------------------------------------------------------------------------
// It draws at all
// --------------------------------------------------------------------------

test("a frame draws on every track, theme, weather and tier", () => {
  for (const id of Tracks.ORDER) {
    for (const tier of Renderer.TIER_ORDER) {
      for (const weather of ["dry", "rain"]) {
        const track = Tracks.get(id, { weather });
        const car = Cars.get("sport");
        const state = Physics.createState(car, track.start);
        state.vx = 28;
        const ctx = recorder();
        const r = Renderer.create({ tier, seed: "d" });
        r.recordTick(state, []);
        r.render({
          ctx, width: 1366, height: 768, track, car, state, rivals: [],
          alpha: 0.3, dt: 1 / 60, look: { paint: "teal" },
          env: { weather, difficulty: "standard" }, hud: { title: "lap", rightBig: "1/3" }
        });
        assert.ok(ctx.polys.length > 20, `${id}/${tier}/${weather} drew only ${ctx.polys.length} polygons`);
        for (const p of ctx.polys) {
          for (const [x, y] of p.pts) {
            assert.ok(Number.isFinite(x) && Number.isFinite(y),
              `${id}/${tier}/${weather} produced a non-finite vertex`);
          }
        }
      }
    }
  }
});

test("every car in the fleet has geometry and renders", () => {
  const track = Tracks.get("club");
  for (const id of Cars.ORDER) {
    const car = Cars.get(id);
    const g = RenderCar.geometry(car);
    assert.ok(g.faces.length > 8, `${id} has only ${g.faces.length} faces`);
    assert.ok(g.nose > g.fx && g.tail < g.rx, `${id}: the body does not enclose its axles`);
    const state = Physics.createState(car, track.start);
    state.vx = 20;
    const ctx = recorder();
    const r = Renderer.create({ tier: "high", seed: "c" });
    r.recordTick(state, []);
    r.render({
      ctx, width: 1024, height: 640, track, car, state, rivals: [],
      alpha: 0, dt: 1 / 60, look: { paint: "teal" }, env: { weather: "dry" }, hud: {}
    });
    assert.ok(ctx.polys.length > 20, id);
  }
});

test("rivals are drawn and sorted behind nearer cars", () => {
  const track = Tracks.get("oval");
  const car = Cars.get("sport");
  const state = Physics.createState(car, track.start);
  state.vx = 25;
  const rivals = [0, 1, 2].map((i) => {
    const p = track.at(30 + i * 14);
    const s = Physics.createState(car, { x: p.x, y: p.y, heading: p.heading });
    s.vx = 24;
    return { state: s, car, look: { paint: "red" } };
  });
  const plain = recorder(), withRivals = recorder();
  const a = Renderer.create({ tier: "high", seed: "r" });
  a.recordTick(state, []);
  a.render({ ctx: plain, width: 1280, height: 720, track, car, state, rivals: [], alpha: 0, dt: 1 / 60, look: {}, env: {}, hud: {} });
  const b = Renderer.create({ tier: "high", seed: "r" });
  b.recordTick(state, rivals.map((r) => r.state));
  b.render({ ctx: withRivals, width: 1280, height: 720, track, car, state, rivals, alpha: 0, dt: 1 / 60, look: {}, env: {}, hud: {} });
  assert.ok(withRivals.polys.length > plain.polys.length, "rivals drew nothing");
});

test("the same seed draws the same frame twice", () => {
  const a = runWithRenderer("high", 4);
  const b = runWithRenderer("high", 4);
  assert.strictEqual(a.ctx.calls.length, b.ctx.calls.length);
  assert.deepStrictEqual(a.ctx.calls.slice(-200), b.ctx.calls.slice(-200));
});

// --------------------------------------------------------------------------
// The design constraint: no slab over the road
// --------------------------------------------------------------------------

/* The approved design forbids large opaque floor or overhang geometry, and
   forbids the camera ever passing beneath a solid horizontal plane. The old
   full-width start/finish crossbar was removed for exactly that reason.
   This walks the world geometry rather than the pixels: anything drawn above
   road height that spans the road would be the thing that is banned. */
test("nothing opaque spans the road above it, at any point on any track", () => {
  for (const id of Tracks.ORDER) {
    const track = Tracks.get(id);
    const car = Cars.get("sport");
    for (const start of [0, track.length * 0.25, track.length * 0.5, track.length - 3]) {
      const p = track.at(start);
      const state = Physics.createState(car, { x: p.x, y: p.y, heading: p.heading });
      state.vx = 30;
      const ctx = recorder();
      const r = Renderer.create({ tier: "high", seed: "slab" });
      r.recordTick(state, []);
      r.render({
        ctx, width: 1280, height: 720, track, car, state, rivals: [],
        alpha: 0, dt: 1 / 60, look: { paint: "teal" }, env: { weather: "dry" }, hud: false
      });
      // Screen y of the horizon: anything the camera could pass under appears
      // ABOVE the horizon line and spans most of the frame's width.
      const view = r.camera.view(1280, 720, null);
      const hz = view.horizon();
      for (const poly of ctx.polys) {
        if (poly.rect) continue;              // sky and ground fills, by design
        if (poly.alpha < 0.9) continue;       // see-through is not a slab
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of poly.pts) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        const spansRoad = (maxX - minX) > 1280 * 0.55;
        const whollyAboveHorizon = maxY < hz - 4;
        assert.ok(!(spansRoad && whollyAboveHorizon),
          `${id} at ${start.toFixed(0)}m drew an opaque ${Math.round(maxX - minX)}px-wide shape entirely above the horizon (${poly.style})`);
      }
    }
  }
});

test("the start gate is two posts with nothing joining them", () => {
  // A regression guard on the specific element that was removed. If a crossbar
  // comes back, it is a single polygon spanning both sides of the road at
  // height, and drawStartLine is where it would be.
  const src = require("node:fs").readFileSync(require.resolve("../racing/render/track.js"), "utf8");
  const fn = src.slice(src.indexOf("function drawStartLine"), src.indexOf("// Barrier and scenery"));
  assert.ok(fn.length > 100);
  assert.ok(!/crossbar|gantry\s*=|banner/i.test(fn), "a crossbar or banner has reappeared in drawStartLine");
  // The posts are drawn inside a loop over both sides; anything joining them
  // would have to use both signs in one polygon.
  assert.ok(/for \(var sgn = -1; sgn <= 1; sgn \+= 2\)/.test(fn), "the posts are no longer drawn independently");
});

test("the barrier leaves a gap underneath rather than being a wall", () => {
  const src = require("node:fs").readFileSync(require.resolve("../racing/render/track.js"), "utf8");
  const fn = src.slice(src.indexOf("function drawBarrier"), src.indexOf("function drawProp"));
  // The rail band starts above the ground; a wall would start at z + 0.
  assert.ok(/z \+ 0\.55/.test(fn), "the rail no longer starts clear of the ground");
});

// --------------------------------------------------------------------------
// Camera
// --------------------------------------------------------------------------

test("blend() interpolates between ticks and takes the short way round", () => {
  const a = { x: 0, y: 0, heading: 3.0, vx: 1, vy: 0, yawRate: 0 };
  const b = { x: 10, y: 4, heading: -3.0, vx: 3, vy: 0, yawRate: 0 };
  const mid = Camera.blend(a, b, 0.5);
  assert.ok(Math.abs(mid.x - 5) < 1e-9);
  assert.ok(Math.abs(mid.y - 2) < 1e-9);
  // 3.0 to -3.0 is 0.28 rad the short way, not 6 rad the long way.
  assert.ok(Math.abs(mid.heading) > 3.0, `went the long way round: ${mid.heading}`);
  assert.deepStrictEqual(Camera.blend(null, b, 0.5).x, b.x);
  assert.strictEqual(Camera.blend(a, b, 0).x, a.x);
  assert.strictEqual(Camera.blend(a, b, 1).x, b.x);
});

test("the chase camera sits behind the car and the hood camera sits in it", () => {
  const pose = { x: 0, y: 0, heading: 0, vx: 30, vy: 0, yawRate: 0 };
  const chase = Camera.create({ mode: "chase" });
  for (let i = 0; i < 180; i++) chase.follow(pose, 1 / 60, 0);
  assert.ok(chase.x < -4, `chase camera is at x=${chase.x}, not behind the car`);
  assert.ok(chase.z > 2, `chase camera is at z=${chase.z}`);

  const hood = Camera.create({ mode: "hood" });
  for (let i = 0; i < 180; i++) hood.follow(pose, 1 / 60, 0);
  assert.ok(Math.abs(hood.x) < 1.2, `hood camera is at x=${hood.x}, not on the car`);
  assert.ok(hood.z > 0.8 && hood.z < 1.6, `hood camera is at z=${hood.z}`);
});

test("the chase camera leans toward the direction a sliding car is travelling", () => {
  // A car pointing along +x but moving to its left is drifting; the camera has
  // to swing toward where it is going or the slide is invisible.
  const straight = { x: 0, y: 0, heading: 0, vx: 25, vy: 0, yawRate: 0 };
  const sliding = { x: 0, y: 0, heading: 0, vx: 25, vy: 12, yawRate: 0.6 };
  const a = Camera.create({ mode: "chase" });
  const b = Camera.create({ mode: "chase" });
  for (let i = 0; i < 240; i++) { a.follow(straight, 1 / 60, 0); b.follow(sliding, 1 / 60, 0); }
  assert.ok(Math.abs(a.yaw) < 0.02, `camera yawed ${a.yaw} on a straight car`);
  assert.ok(b.yaw > 0.1, `camera did not lean into the slide (yaw ${b.yaw})`);
});

test("the camera does not swing round to look at the boot of a reversing car", () => {
  const reversing = { x: 0, y: 0, heading: 0, vx: -6, vy: 2, yawRate: 0 };
  const c = Camera.create({ mode: "chase" });
  for (let i = 0; i < 180; i++) c.follow(reversing, 1 / 60, 0);
  assert.ok(Math.abs(c.yaw) < 0.05, `camera yawed to ${c.yaw} while reversing`);
});

test("camera damping is frame-rate independent", () => {
  const pose = { x: 40, y: 12, heading: 0.6, vx: 22, vy: 0, yawRate: 0 };
  const slow = Camera.create({ mode: "chase" });
  const fast = Camera.create({ mode: "chase" });
  slow.follow({ x: 0, y: 0, heading: 0, vx: 0, vy: 0, yawRate: 0 }, 1 / 30, 0);
  fast.follow({ x: 0, y: 0, heading: 0, vx: 0, vy: 0, yawRate: 0 }, 1 / 120, 0);
  for (let i = 0; i < 60; i++) slow.follow(pose, 1 / 30, 0);
  for (let i = 0; i < 240; i++) fast.follow(pose, 1 / 120, 0);
  assert.ok(Math.abs(slow.x - fast.x) < 0.25, `30fps camera at ${slow.x}, 120fps at ${fast.x}`);
  assert.ok(Math.abs(slow.yaw - fast.yaw) < 0.02);
});

test("field of view opens with speed and settles back", () => {
  const slow = Camera.create({ mode: "chase" });
  const fast = Camera.create({ mode: "chase" });
  for (let i = 0; i < 300; i++) {
    slow.follow({ x: 0, y: 0, heading: 0, vx: 8, vy: 0, yawRate: 0 }, 1 / 60, 0);
    fast.follow({ x: 0, y: 0, heading: 0, vx: 70, vy: 0, yawRate: 0 }, 1 / 60, 0);
  }
  assert.ok(fast.fov > slow.fov + 0.08, `fov ${fast.fov} vs ${slow.fov}`);
});

test("projection: a point ahead lands in the middle, behind the camera lands nowhere", () => {
  const c = Camera.create({ mode: "chase" });
  c.follow({ x: 0, y: 0, heading: 0, vx: 20, vy: 0, yawRate: 0 }, 1 / 60, 0);
  const view = c.view(1000, 600, null);
  const ahead = view.point(60, 0, 0);
  assert.ok(ahead && Math.abs(ahead.x - 500) < 40, "a point straight ahead is not near the centre");
  assert.strictEqual(view.point(c.x - 5, c.y, c.z), null, "a point behind the camera projected anyway");
  // The horizon is on screen for a near-level camera.
  assert.ok(view.horizon() > 0 && view.horizon() < 600);
});

test("near-plane clipping keeps a straddling polygon finite", () => {
  const c = Camera.create({ mode: "chase" });
  c.follow({ x: 0, y: 0, heading: 0, vx: 0, vy: 0, yawRate: 0 }, 1 / 60, 0);
  const view = c.view(800, 600, null);
  // A quad running from well behind the camera to well in front of it.
  const poly = view.polygon([
    { x: c.x - 20, y: -5, z: 0 }, { x: c.x - 20, y: 5, z: 0 },
    { x: c.x + 40, y: 5, z: 0 }, { x: c.x + 40, y: -5, z: 0 }
  ]);
  assert.ok(poly.length >= 3, "clipping discarded a polygon that is partly visible");
  for (const p of poly) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), "clipping produced an infinite vertex");
  }
});

// --------------------------------------------------------------------------
// Effects
// --------------------------------------------------------------------------

test("tyre smoke appears when the car slides and not when it does not", () => {
  const car = Cars.get("sport");
  const rng = Random.create("fx");
  const quiet = EffectsMod.create({ rng: rng.fork("a"), tier: "high" });
  const drifting = EffectsMod.create({ rng: rng.fork("b"), tier: "high" });
  const pose = { x: 0, y: 0, heading: 0 };
  const calm = { vx: 25, vy: 0, slipR: 0.01, wheelspin: 0 };
  const slide = { vx: 25, vy: 10, slipR: 0.55, wheelspin: 0.3 };
  for (let i = 0; i < 60; i++) {
    quiet.emit(pose, calm, car, 1 / 60, { weather: "dry" });
    drifting.emit(pose, slide, car, 1 / 60, { weather: "dry" });
  }
  assert.strictEqual(quiet.smoke.length, 0);
  assert.ok(drifting.smoke.length > 10, `only ${drifting.smoke.length} puffs`);
  assert.ok(drifting.skids.length > 0, "a drifting car left no marks");
});

test("particle budgets are respected and are what the tiers differ in", () => {
  const car = Cars.get("sport");
  const pose = { x: 0, y: 0, heading: 0 };
  const slide = { vx: 30, vy: 14, slipR: 0.7, wheelspin: 0.5 };
  for (const tier of ["low", "medium", "high"]) {
    const fx = EffectsMod.create({ rng: Random.create("b").fork(tier), tier });
    for (let i = 0; i < 600; i++) fx.emit(pose, slide, car, 1 / 60, { weather: "dry" });
    assert.ok(fx.smoke.length <= EffectsMod.BUDGETS[tier].smoke, tier);
    assert.ok(fx.skids.length <= EffectsMod.BUDGETS[tier].skid, tier);
  }
  assert.ok(EffectsMod.BUDGETS.high.smoke > EffectsMod.BUDGETS.low.smoke);
});

test("spray only happens in the wet", () => {
  const car = Cars.get("sport");
  const pose = { x: 0, y: 0, heading: 0 };
  const fast = { vx: 30, vy: 0, slipR: 0, wheelspin: 0 };
  const dry = EffectsMod.create({ rng: Random.create("c").fork("d"), tier: "high" });
  const wet = EffectsMod.create({ rng: Random.create("c").fork("w"), tier: "high" });
  for (let i = 0; i < 120; i++) {
    dry.emit(pose, fast, car, 1 / 60, { weather: "dry" });
    wet.emit(pose, fast, car, 1 / 60, { weather: "rain" });
  }
  assert.strictEqual(dry.spray.length, 0);
  assert.ok(wet.spray.length > 0);
});

test("particles expire rather than accumulating for ever", () => {
  const fx = EffectsMod.create({ rng: Random.create("e"), tier: "high" });
  const car = Cars.get("sport");
  for (let i = 0; i < 30; i++) fx.emit({ x: 0, y: 0, heading: 0 }, { vx: 25, vy: 12, slipR: 0.6, wheelspin: 0.2 }, car, 1 / 60, { weather: "dry" });
  assert.ok(fx.smoke.length > 0);
  for (let i = 0; i < 60 * 40; i++) fx.update(1 / 60);
  assert.strictEqual(fx.smoke.length, 0, "smoke never cleared");
  assert.strictEqual(fx.skids.length, 0, "skid marks never faded");
});

test("changing tier mid-run keeps the marks already on the road", () => {
  const fx = EffectsMod.create({ rng: Random.create("f"), tier: "high" });
  const car = Cars.get("sport");
  for (let i = 0; i < 200; i++) fx.emit({ x: i, y: 0, heading: 0 }, { vx: 25, vy: 12, slipR: 0.6, wheelspin: 0 }, car, 1 / 60, { weather: "dry" });
  const had = fx.skids.length;
  assert.ok(had > 0);
  fx.setTier("low");
  assert.ok(fx.skids.length > 0, "dropping a tier wiped the skid marks");
  assert.ok(fx.skids.length <= EffectsMod.BUDGETS.low.skid);
  assert.ok(had >= fx.skids.length);
});

// --------------------------------------------------------------------------
// Tier and palette bookkeeping
// --------------------------------------------------------------------------

test("every tier is defined everywhere it is used", () => {
  for (const tier of Renderer.TIER_ORDER) {
    assert.ok(RenderTrack.TIERS[tier], `track has no budget for ${tier}`);
    assert.ok(EffectsMod.BUDGETS[tier], `effects has no budget for ${tier}`);
  }
  // Draw distance and particle counts must actually increase with tier, or the
  // setting is cosmetic and the performance budgets are unreachable.
  assert.ok(RenderTrack.TIERS.low.draw < RenderTrack.TIERS.medium.draw);
  assert.ok(RenderTrack.TIERS.medium.draw < RenderTrack.TIERS.high.draw);
  assert.ok(RenderTrack.TIERS.low.nearStep > RenderTrack.TIERS.high.nearStep);
});

test("an unknown tier or theme falls back instead of drawing nothing", () => {
  assert.strictEqual(RenderTrack.tier("ultra"), RenderTrack.TIERS.medium);
  assert.strictEqual(RenderTrack.theme("neon"), RenderTrack.THEMES.sunset);
  const r = Renderer.create({ tier: "ultra" });
  assert.strictEqual(r.tier, "medium");
});

test("every theme defines every colour the renderer asks for", () => {
  const keys = Object.keys(RenderTrack.THEMES.sunset);
  for (const [name, pal] of Object.entries(RenderTrack.THEMES)) {
    for (const k of keys) {
      assert.ok(pal[k] !== undefined, `theme ${name} is missing ${k}`);
      if (typeof pal[k] === "string" && pal[k].startsWith("#")) {
        assert.ok(/^#[0-9a-f]{6}$/i.test(pal[k]), `theme ${name}.${k} is not a colour: ${pal[k]}`);
      }
    }
  }
});

test("every track theme is a theme the renderer has", () => {
  for (const id of Tracks.ORDER) {
    const t = Tracks.TRACKS[id];
    assert.ok(RenderTrack.THEMES[t.theme], `${id} wants theme "${t.theme}" which does not exist`);
  }
});

test("every car body preset is one the car renderer knows", () => {
  for (const id of Cars.ORDER) {
    const car = Cars.get(id);
    assert.ok(RenderCar.BODIES[car.body], `${id} has body "${car.body}" with no preset`);
  }
});

test("all ten cars have visibly different silhouettes", () => {
  // The fleet shares six body presets, so this is the check that the category
  // tweaks and the per-car geometry actually distinguish them. Two cars are
  // "different" if their overall length, width or cabin height differ by more
  // than a few centimetres.
  const shapes = Cars.ORDER.map((id) => {
    const g = RenderCar.geometry(Cars.get(id));
    return { id, len: g.nose - g.tail, w: g.w, roof: g.roof, belt: g.belt };
  });
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i], b = shapes[j];
      const diff = Math.abs(a.len - b.len) + Math.abs(a.w - b.w) + Math.abs(a.roof - b.roof);
      assert.ok(diff > 0.08, `${a.id} and ${b.id} are the same shape (difference ${diff.toFixed(3)} m)`);
    }
  }
});

test("reduced motion holds the camera still and skips the speed treatment", () => {
  const { track, car, state } = world();
  state.vx = 40;
  const plain = recorder(), calm = recorder();
  const a = Renderer.create({ tier: "high", seed: "m" });
  const b = Renderer.create({ tier: "high", seed: "m", reducedMotion: true });
  const f = (ctx) => ({ ctx, width: 1280, height: 720, track, car, state, rivals: [], alpha: 0, dt: 1 / 60, look: {}, env: {}, hud: {} });
  a.recordTick(state, []); a.render(f(plain));
  b.recordTick(state, []); b.render(f(calm));
  assert.ok(calm.calls.length < plain.calls.length, "reduced motion drew just as much");
});
