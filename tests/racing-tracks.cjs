/* Track geometry.
 *
 * The AI, renderer and lap timer all read a track through the same small
 * interface, and all three break in different ways if the geometry is subtly
 * wrong: the AI brakes for corners that are not there if the curvature is
 * noisy, it latches onto the wrong lap if the seam does not close, and `at()`
 * returns the wrong point entirely if the samples are not evenly spaced.
 *
 * So these tests check the properties the consumers rely on, and then actually
 * drive an AI car round every circuit, which is the only check that catches a
 * track that is geometrically fine but undriveable.
 */
const test = require("node:test");
const assert = require("node:assert");

const Tracks = require("../racing/data/tracks.js");
const Cars = require("../racing/data/cars.js");
const Physics = require("../racing/core/vehicle-physics.js");
const AI = require("../racing/game/ai.js");
const FixedStep = require("../racing/core/fixed-step.js");

const CIRCUITS = Tracks.ORDER.filter((id) => !Tracks.TRACKS[id].sandbox);

function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

test("every track in ORDER builds", () => {
  for (const id of Tracks.ORDER) {
    const t = Tracks.get(id);
    assert.equal(t.id, id, id);
    assert.ok(t.length > 100, `${id} length ${t.length}`);
    assert.ok(t.half > 4 && t.half < 12, `${id} half ${t.half}`);
    assert.ok(t.pts.length > 100, id);
  }
});

test("an unknown id falls back to the default circuit instead of throwing", () => {
  const t = Tracks.get("no-such-track");
  assert.equal(t.id, "oval");
});

test("centre-line samples are evenly spaced in arc length", () => {
  for (const id of Tracks.ORDER) {
    const t = Tracks.get(id);
    const n = t.pts.length;
    let min = Infinity, max = 0;
    for (let i = 0; i < n; i++) {
      const a = t.pts[i], b = t.pts[(i + 1) % n];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    // Chord is marginally shorter than arc on a bend, so allow 2%: anything
    // worse means the resampler is not working in arc length at all.
    assert.ok(Math.abs(max - t.ds) / t.ds < 0.02, `${id} max spacing ${max} vs ds ${t.ds}`);
    assert.ok(Math.abs(min - t.ds) / t.ds < 0.02, `${id} min spacing ${min} vs ds ${t.ds}`);
  }
});

test("the loop closes: the seam is as smooth as any other sample", () => {
  for (const id of Tracks.ORDER) {
    const t = Tracks.get(id);
    const n = t.pts.length;
    const seam = Math.hypot(t.pts[0].x - t.pts[n - 1].x, t.pts[0].y - t.pts[n - 1].y);
    assert.ok(Math.abs(seam - t.ds) / t.ds < 0.02, `${id} seam gap ${seam}`);
    // Heading and curvature must not step across the start line either.
    assert.ok(Math.abs(wrapAngle(t.pts[0].heading - t.pts[n - 1].heading)) < 0.05, `${id} heading step at seam`);
    assert.ok(Math.abs(t.pts[0].curvature - t.pts[n - 1].curvature) < 0.004, `${id} curvature step at seam`);
  }
});

test("at() wraps, and at(0) equals at(length)", () => {
  const t = Tracks.get("club");
  const a = t.at(0), b = t.at(t.length), c = t.at(-t.length);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
  assert.ok(Math.hypot(a.x - c.x, a.y - c.y) < 1e-6);
  // And a long way round still lands in the right place.
  const d = t.at(t.length * 3 + 120), e = t.at(120);
  assert.ok(Math.hypot(d.x - e.x, d.y - e.y) < 1e-6);
});

test("at(d) really is d metres along the path", () => {
  const t = Tracks.get("tech");
  let walked = 0;
  let prev = t.at(0);
  const stepLen = 5;
  for (let d = stepLen; d <= t.length; d += stepLen) {
    const p = t.at(d);
    walked += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  // Walking in 5 m chords under-measures a curved path slightly.
  assert.ok(Math.abs(walked - t.length) / t.length < 0.01, `walked ${walked} vs length ${t.length}`);
});

test("at() returns the interface the AI expects", () => {
  const t = Tracks.get("oval");
  const p = t.at(123.4);
  for (const k of ["x", "y", "heading", "curvature", "half"]) {
    assert.equal(typeof p[k], "number", k);
    assert.ok(Number.isFinite(p[k]), k);
  }
  assert.equal(p.half, t.half);
});

test("heading matches the direction the path actually travels", () => {
  for (const id of Tracks.ORDER) {
    const t = Tracks.get(id);
    for (let d = 0; d < t.length; d += t.length / 37) {
      const p = t.at(d), q = t.at(d + 2);
      const walkHeading = Math.atan2(q.y - p.y, q.x - p.x);
      assert.ok(Math.abs(wrapAngle(walkHeading - p.heading)) < 0.12, `${id} at ${d}`);
    }
  }
});

test("curvature sign follows the direction the path turns", () => {
  for (const id of CIRCUITS) {
    const t = Tracks.get(id);
    // Over a 12 m window, the sign of the heading change and the sign of the
    // reported curvature have to agree wherever the bend is real.
    let checked = 0;
    for (let d = 0; d < t.length; d += 3) {
      const p = t.at(d), q = t.at(d + 12);
      const turn = wrapAngle(q.heading - p.heading);
      if (Math.abs(turn) < 0.08) continue;      // straight enough to be noise
      checked++;
      assert.ok(Math.sign(turn) === Math.sign(p.curvature + q.curvature),
        `${id} at ${d}: turns ${turn.toFixed(3)} but curvature ${p.curvature.toFixed(5)}`);
    }
    assert.ok(checked > 20, `${id} had too few real bends to check (${checked})`);
  }
});

test("curvature magnitude matches the radius the path sweeps", () => {
  const t = Tracks.get("oval");
  for (let d = 0; d < t.length; d += 17) {
    const p = t.at(d), q = t.at(d + 20);
    const measured = Math.abs(wrapAngle(q.heading - p.heading)) / 20;
    const reported = Math.abs((p.curvature + q.curvature) / 2);
    assert.ok(Math.abs(measured - reported) < 0.004,
      `at ${d}: measured ${measured.toFixed(5)} reported ${reported.toFixed(5)}`);
  }
});

test("curvature is smooth: no spikes between neighbouring metres", () => {
  for (const id of Tracks.ORDER) {
    const t = Tracks.get(id);
    const n = t.pts.length;
    for (let i = 0; i < n; i++) {
      const jump = Math.abs(t.pts[(i + 1) % n].curvature - t.pts[i].curvature);
      assert.ok(jump < 0.004, `${id} curvature jumps ${jump} at ${i}`);
    }
  }
});

test("no corner is tighter than the fleet can physically take", () => {
  // The slowest useful cornering speed is about 25 km/h; a corner that demands
  // less than that is a hairpin no car can drive round and a track bug.
  for (const id of CIRCUITS) {
    const t = Tracks.get(id);
    let worst = 0;
    for (const p of t.pts) worst = Math.max(worst, Math.abs(p.curvature));
    const vmin = Math.sqrt(1.05 * Physics.G / worst) * 3.6;
    assert.ok(vmin > 25, `${id} tightest corner is drivable only at ${vmin.toFixed(1)} km/h`);
  }
});

test("surfaces: road at the centre, kerb at the edge, grass beyond", () => {
  const t = Tracks.get("club");
  const p = t.at(200);
  const lat = (n) => ({ x: p.x - Math.sin(p.heading) * n, y: p.y + Math.cos(p.heading) * n });
  assert.equal(t.surfaceAt(p.x, p.y, 200), "road");
  const edge = lat(t.half + (t.kerb - t.half) * 0.5);
  assert.equal(t.surfaceAt(edge.x, edge.y, 200), "kerb");
  const off = lat(t.runoff + 6);
  assert.equal(t.surfaceAt(off.x, off.y, 200), "grass");
});

test("a mountain track runs off onto gravel, not lawn", () => {
  const t = Tracks.get("ridge");
  const p = t.at(150);
  const off = { x: p.x - Math.sin(p.heading) * (t.kerb + (t.runoff - t.kerb) * 0.5), y: p.y + Math.cos(p.heading) * (t.kerb + (t.runoff - t.kerb) * 0.5) };
  assert.equal(t.surfaceAt(off.x, off.y, 150), "gravel");
});

test("the sandbox is tarmac, so a car park does not punish leaving the paint", () => {
  const t = Tracks.get("lot");
  assert.ok(t.sandbox);
  const p = t.at(40);
  const off = { x: p.x - Math.sin(p.heading) * (t.runoff + 4), y: p.y + Math.cos(p.heading) * (t.runoff + 4) };
  assert.equal(t.surfaceAt(off.x, off.y, 40), "road");
});

test("every surface the track can name exists in the physics model", () => {
  const named = new Set();
  for (const id of Tracks.ORDER) {
    const t = Tracks.get(id, { weather: "rain" });
    for (let d = 0; d < t.length; d += 7) {
      const p = t.at(d);
      for (const n of [0, t.half * 0.5, t.half * 1.05, t.kerb * 1.1, t.runoff + 3]) {
        const q = { x: p.x - Math.sin(p.heading) * n, y: p.y + Math.cos(p.heading) * n };
        named.add(t.surfaceAt(q.x, q.y, d));
      }
    }
  }
  assert.ok(named.size >= 3);
  for (const s of named) assert.ok(Physics.SURFACES[s], `physics has no surface "${s}"`);
});

test("weather variants change grip and only rain lays standing water", () => {
  const dry = Tracks.get("oval", { weather: "dry" });
  const wet = Tracks.get("oval", { weather: "wet" });
  const rain = Tracks.get("oval", { weather: "rain" });
  assert.equal(dry.weatherGrip, 1);
  assert.equal(dry.plannedGrip, 1, "a dry road holds no surprises");
  // In the wet a driver has to plan for the water, not for the dry line.
  assert.ok(wet.plannedGrip < wet.weatherGrip);
  assert.ok(rain.plannedGrip < wet.plannedGrip);
  assert.ok(wet.weatherGrip < dry.weatherGrip);
  assert.ok(rain.weatherGrip < wet.weatherGrip);
  assert.equal(dry.puddles.length, 0);
  assert.ok(wet.puddles.length > 0);
  assert.ok(rain.puddles.length > wet.puddles.length);
  // The geometry is identical across variants: weather is a surface, not a
  // different track, or a ghost could not be compared across conditions.
  assert.equal(dry.length, rain.length);
  assert.equal(dry.pts.length, rain.pts.length);
});

test("weather reaches the physics through envFor", () => {
  const rain = Tracks.get("oval", { weather: "rain" });
  const s = Physics.createState(Cars.get("sport"), rain.start);
  const env = rain.envFor(s, "standard", 0);
  assert.equal(env.weather, "rain");
  assert.ok(Physics.WEATHER[env.weather] < 1);
});

test("standing water is bounded and lands on the road", () => {
  const t = Tracks.get("rain" in Tracks.TRACKS ? "oval" : "oval", { weather: "rain" });
  for (const p of t.puddles) {
    assert.ok(p.s >= 0 && p.s <= t.length);
    assert.ok(Math.abs(p.lat) <= 1);
    assert.ok(p.len > 0 && p.width > 0);
    assert.ok(t.standingWater(p.s, p.lat) > 0.9, "a puddle should be deepest at its own centre");
  }
  assert.equal(t.standingWater(t.puddles[0].s, 0) >= 0, true);
});

test("track construction is deterministic for a seed", () => {
  const a = Tracks.build("canyon", { weather: "rain", seed: "abc" });
  const b = Tracks.build("canyon", { weather: "rain", seed: "abc" });
  assert.deepStrictEqual(a.puddles, b.puddles);
  assert.deepStrictEqual(a.props, b.props);
  const c = Tracks.build("canyon", { weather: "rain", seed: "xyz" });
  assert.notDeepStrictEqual(a.puddles, c.puddles);
});

test("scenery never stands on the racing surface", () => {
  for (const id of Tracks.ORDER) {
    const t = Tracks.get(id);
    for (const p of t.props) {
      const near = t.nearest(p.x, p.y);
      assert.ok(Math.abs(near.lateral) >= t.half - 0.01,
        `${id}: a ${p.kind} is ${near.lateral.toFixed(2)} m from the centre of a ${t.half.toFixed(2)} m half-road`);
    }
  }
});

test("nearest() finds the same point with and without a hint", () => {
  const t = Tracks.get("harbor");
  for (let d = 0; d < t.length; d += 23) {
    const p = t.at(d);
    const probe = { x: p.x + 3, y: p.y - 2 };
    const cold = t.nearest(probe.x, probe.y);
    const warm = t.nearest(probe.x, probe.y, d);
    assert.equal(warm.index, cold.index, `at ${d}`);
  }
});

test("nearest() signs lateral offset to the left of travel", () => {
  const t = Tracks.get("oval");
  const p = t.at(80);
  const left = { x: p.x - Math.sin(p.heading) * 4, y: p.y + Math.cos(p.heading) * 4 };
  assert.ok(t.nearest(left.x, left.y, 80).lateral > 3.5);
  const right = { x: p.x + Math.sin(p.heading) * 4, y: p.y - Math.cos(p.heading) * 4 };
  assert.ok(t.nearest(right.x, right.y, 80).lateral < -3.5);
});

test("grid slots are on the road, behind the line, and do not overlap", () => {
  for (const id of CIRCUITS) {
    const t = Tracks.get(id);
    const slots = [];
    for (let i = 0; i < 6; i++) slots.push(t.start.slot(i));
    for (let i = 0; i < slots.length; i++) {
      const near = t.nearest(slots[i].x, slots[i].y);
      assert.ok(Math.abs(near.lateral) < t.half, `${id} slot ${i} is off the road`);
      for (let j = i + 1; j < slots.length; j++) {
        const gap = Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y);
        assert.ok(gap > 4, `${id} slots ${i} and ${j} are ${gap.toFixed(1)} m apart`);
      }
    }
  }
});

// --------------------------------------------------------------------------
// The real test: can a car actually get round?
// --------------------------------------------------------------------------

/* Drives one AI car for a fixed number of ticks and reports what happened. The
   AI is the one in racing/game/ai.js, unmodified, consuming the track through
   the same `at()` the renderer uses. */
function driveLap(trackId, opts = {}) {
  const track = Tracks.get(trackId, { weather: opts.weather || "dry" });
  const car = Cars.get(opts.car || "sport");
  const start = track.start;
  const state = Physics.createState(car, { x: start.x, y: start.y, heading: start.heading });
  const driver = AI.create({ line: track, car: car, skill: opts.skill || "medium", seed: "lap:" + trackId, grip: track.plannedGrip });
  const clock = FixedStep.create();

  let offRoad = 0, maxGap = 0, travelled = 0, lastDistance = 0, lapDistance = 0, worstSpeed = Infinity;
  const ticks = opts.ticks || 60 * 120;
  let prevX = state.x, prevY = state.y;

  for (let i = 0; i < ticks; i++) {
    const near = track.nearest(state.x, state.y, lastDistance);
    lastDistance = near.distance;
    // AI cars drive without assists: the assists are a player aid, and they
    // trim the steering the AI's own controller is counting on.
    const env = { difficulty: opts.difficulty || "expert", weather: track.weather, surface: track.surfaceAt(state.x, state.y, lastDistance) };
    state.surfaceF = env.surface;
    state.surfaceR = env.surface;
    const input = driver.control(state, [], FixedStep.STEP);
    Physics.step(state, car, input, env, FixedStep.STEP);
    clock.advance(FixedStep.STEP, () => {});

    const gap = Math.abs(near.lateral);
    if (gap > maxGap) maxGap = gap;
    if (gap > track.half) offRoad++;
    travelled += Math.hypot(state.x - prevX, state.y - prevY);
    prevX = state.x; prevY = state.y;
    // Ignore the standing start when judging minimum speed.
    if (i > 240) worstSpeed = Math.min(worstSpeed, Physics.kph(state));
    lapDistance = near.distance;
  }
  return { track, state, offRoad, maxGap, travelled, worstSpeed, ticks, lapDistance, laps: driver.lap };
}

/* The acceptance criterion for a track: an AI car gets round it, on the road,
   without stopping. This is the test that catches a circuit which is
   geometrically well formed and still undriveable, and it is the reason the
   curvature relaxation in tracks.js exists at all -- before it, the v1 control
   points read as metres produced hairpins that no car could negotiate and every
   one of these assertions failed. */
test("the AI drives every circuit without putting a wheel off the road", () => {
  for (const id of CIRCUITS) {
    const r = driveLap(id);
    assert.ok(Number.isFinite(r.state.x) && Number.isFinite(r.state.y), `${id} produced a non-finite position`);
    assert.ok(r.travelled > r.track.length * 0.8,
      `${id}: covered only ${r.travelled.toFixed(0)} m of a ${r.track.length.toFixed(0)} m lap in 120 s`);
    assert.ok(r.worstSpeed > 8, `${id}: the AI came to a near stop (${r.worstSpeed.toFixed(1)} km/h)`);
    // On the road for the whole lap, not merely inside the run-off.
    assert.equal(r.offRoad, 0,
      `${id}: spent ${r.offRoad} of ${r.ticks} ticks off the road, straying ${r.maxGap.toFixed(1)} m from the centre of a ${r.track.half.toFixed(1)} m half-road`);
    assert.ok(r.maxGap < r.track.half,
      `${id}: wandered ${r.maxGap.toFixed(1)} m from the centre line`);
  }
});

test("the AI gets round the sandbox too", () => {
  const r = driveLap("lot", { ticks: 60 * 45 });
  assert.ok(r.travelled > 200, `covered ${r.travelled.toFixed(0)} m`);
  assert.ok(Number.isFinite(r.state.x));
});

test("the AI gets round in the rain, more slowly", () => {
  for (const id of ["oval", "ridge"]) {
    const dry = driveLap(id, { weather: "dry" });
    const wet = driveLap(id, { weather: "rain" });
    assert.ok(wet.travelled > wet.track.length * 0.55, `${id} wet: only ${wet.travelled.toFixed(0)} m`);
    assert.equal(wet.offRoad, 0, `${id}: ${wet.offRoad} ticks off the road in the rain`);
    assert.ok(wet.travelled < dry.travelled, `${id}: rain was not slower than dry`);
    assert.ok(Number.isFinite(wet.state.x));
  }
});

test("every car in the fleet gets round a circuit", () => {
  for (const id of Cars.ORDER) {
    const r = driveLap("club", { car: id, ticks: 60 * 100 });
    assert.ok(Number.isFinite(r.state.x), `${id} produced a non-finite position`);
    assert.ok(r.travelled > r.track.length * 0.6, `${id}: covered only ${r.travelled.toFixed(0)} m`);
    assert.ok(r.maxGap < r.track.half, `${id}: wandered ${r.maxGap.toFixed(1)} m off line`);
  }
});

test("driving a track is deterministic", () => {
  const a = driveLap("canyon", { ticks: 60 * 20 });
  const b = driveLap("canyon", { ticks: 60 * 20 });
  assert.deepStrictEqual(Physics.snapshot(a.state), Physics.snapshot(b.state));
});

test("a harder AI is quicker round the same lap", () => {
  const easy = driveLap("club", { skill: "easy" });
  const hard = driveLap("club", { skill: "hard" });
  assert.ok(hard.travelled > easy.travelled,
    `hard covered ${hard.travelled.toFixed(0)} m, easy ${easy.travelled.toFixed(0)} m`);
});
