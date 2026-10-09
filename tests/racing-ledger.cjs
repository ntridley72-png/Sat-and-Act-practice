/* Unit tests for the parts of the racing economy that are pure functions: the
   garage normaliser, the tune validator, the server-side scorer and the daily
   challenge seeding. The ledger's transactional behaviour needs a database and
   is covered by tests/racing-economy.integration.cjs. */
const assert = require('node:assert/strict');

(async () => {
  const racing = await import('../worker/racing.js');
  const { normalizeGarageData, tuneProblem, scoreReplay, itemPrice, validOpId, handleFrom, dailyChallenge, TUNE_MIN, TUNE_MAX } = racing._internal;
  const Cars = require('../racing/data/cars.js');
  const Ghost = require('../racing/game/ghost.js');
  const Physics = require('../racing/core/vehicle-physics.js');
  const FixedStep = require('../racing/core/fixed-step.js');
  const Random = require('../racing/core/random.js');

  // ---- operation ids ------------------------------------------------------
  // Replay protection is only as good as the id, so a short or empty id is
  // refused rather than quietly colliding with another device's operation.
  assert.equal(validOpId(''), null, 'an empty operation id is refused');
  assert.equal(validOpId('short'), null, 'a too-short operation id is refused');
  assert.equal(validOpId('a'.repeat(200)), null, 'an absurd operation id is refused');
  assert.equal(validOpId('x'.repeat(16) + '; DROP TABLE'), null, 'an operation id with punctuation outside the allowed set is refused');
  assert.equal(validOpId('11111111-2222-3333-4444-555555555555'), '11111111-2222-3333-4444-555555555555', 'a uuid is a valid operation id');

  // ---- prices come from the server ----------------------------------------
  assert.equal(itemPrice('car', 'sport'), 0, 'the starter car is free');
  assert.equal(itemPrice('car', 'hyper'), 9000, 'the hypercar keeps its catalogue price');
  assert.equal(itemPrice('car', 'not-a-car'), null, 'an unknown car has no price and cannot be bought');
  assert.equal(itemPrice('kit', 'wide'), 1500, 'body kit prices are server-side');
  assert.equal(itemPrice('wing', 'gt'), 600, 'wing prices are server-side');
  assert.equal(itemPrice('kit', 'constructor'), null, 'an inherited Object property is not an item for sale');
  assert.equal(itemPrice('kit', '__proto__'), null, '__proto__ is not an item for sale');
  assert.equal(itemPrice('nonsense', 'wide'), null, 'an unknown purchase kind has no price');

  // ---- garage normalising -------------------------------------------------
  const fresh = normalizeGarageData(null);
  assert.deepEqual(fresh.cars, ['sport'], 'a fresh garage owns the starter car and nothing else');
  assert.deepEqual([...fresh.tracks].sort(), ['club', 'lot', 'oval'], 'a fresh garage has the free tracks');

  const junk = normalizeGarageData({
    cars: ['sport', 'ferrari', 'rally', 'x'.repeat(200), 42, null, 'rally'],
    kits: ['wide', 'not-a-kit'],
    wings: ['gt'],
    tracks: ['canyon', 'mars'],
    dailyDone: { '2026-10-09': 'run-1', 'not-a-date': 'run-2', '2026-10-10': 99 },
    prefs: { paint: { value: 'teal', changedAt: 5, deviceId: 'a' }, bad: { value: 'x' }, worse: 'nope' }
  });
  assert.deepEqual([...junk.cars].sort(), ['rally', 'sport'], 'unknown and oversized car ids are dropped, duplicates collapse');
  assert.deepEqual([...junk.kits].sort(), ['stock', 'wide'], 'an unknown body kit is dropped and stock is always owned');
  assert.deepEqual([...junk.tracks].sort(), ['canyon', 'club', 'lot', 'oval'], 'an unknown track is dropped');
  assert.deepEqual(Object.keys(junk.dailyDone), ['2026-10-09'], 'only well-formed daily completions survive');
  assert.deepEqual(Object.keys(junk.prefs), ['paint'], 'a preference without a timestamp cannot win a last-writer comparison, so it is dropped');

  // A normalise pass must never invent money or ownership, and must be stable.
  assert.deepEqual(normalizeGarageData(junk), junk, 'normalising is idempotent');

  // ---- tune validation ----------------------------------------------------
  // This is the hole that re-simulation alone does not close. Ghost.replay does
  // `Object.assign({}, car, { tune: ghost.meta.tune })` and Ghost.verify never
  // inspects `tune`, so a recording made with an absurd setup replays perfectly
  // self-consistently -- every checkpoint matches, the hash chain is intact --
  // and lands an impossible time on the board.
  assert.equal(tuneProblem(null), null, 'no tune at all is fine');
  assert.equal(tuneProblem({ power: 1.0, grip: 1.2 }), null, 'an in-range tune passes');
  assert.equal(tuneProblem({ power: TUNE_MIN, grip: TUNE_MAX }), null, 'the slider endpoints pass');
  assert.match(String(tuneProblem({ power: 1000 })), /out of range/, 'a 1000x power tune is refused');
  assert.match(String(tuneProblem({ power: -5 })), /out of range/, 'a negative power tune is refused');
  assert.match(String(tuneProblem({ power: 1.41 })), /out of range/, 'just past the slider maximum is refused');
  assert.match(String(tuneProblem({ nitrous: 1.0 })), /unknown tuning field/, 'an invented tuning field is refused');
  assert.match(String(tuneProblem({ power: '1.2' })), /non-numeric/, 'a stringly-typed tune value is refused');
  assert.match(String(tuneProblem({ power: Number.NaN })), /non-numeric/, 'NaN is refused rather than compared');
  assert.match(String(tuneProblem({ power: Number.POSITIVE_INFINITY })), /non-numeric/, 'Infinity is refused');
  assert.match(String(tuneProblem([1, 2])), /not a setup/, 'an array is not a tune');
  assert.match(String(tuneProblem('power=9000')), /not a setup/, 'a string is not a tune');

  // ---- the server scores the replay, not the claim ------------------------
  const ghost = buildGhost({ ticks: 180 });
  const verified = Ghost.verify(ghost, Cars);
  assert.ok(verified.ok, 'the test fixture is a genuine recording: ' + verified.reason);
  const measured = scoreReplay(ghost);
  assert.ok(measured.distanceM > 0, 'the car actually moved');
  assert.ok(measured.topKph > 0, 'the car reached a speed');
  assert.ok(Number.isFinite(measured.score) && measured.score > 0, 'the run scores');
  assert.equal(measured.seconds, 180 * FixedStep.STEP, 'run length comes from the tick count');

  // A fabricated summary does not change what the server measures.
  const lying = JSON.parse(JSON.stringify(ghost));
  lying.summary = { score: 999999999 };
  assert.equal(scoreReplay(lying).score, measured.score, 'the claimed summary score has no effect on the derived score');

  // Scoring the same recording twice gives the same number, which is what makes
  // a stored score auditable at all.
  assert.equal(scoreReplay(JSON.parse(JSON.stringify(ghost))).score, measured.score, 'scoring is deterministic');

  // ---- forged recordings fail verification --------------------------------
  const edited = JSON.parse(JSON.stringify(ghost));
  edited.checkpoints[1].x += 500;
  assert.equal(Ghost.verify(edited, Cars).ok, false, 'a moved checkpoint fails verification');

  const retimed = JSON.parse(JSON.stringify(ghost));
  retimed.ticks = 60;
  assert.equal(Ghost.verify(retimed, Cars).ok, false, 'shortening the run to fake a lap time fails verification');

  const reversed = JSON.parse(JSON.stringify(ghost));
  if (reversed.inputs.length > 2) {
    const t = reversed.inputs[1][0]; reversed.inputs[1][0] = reversed.inputs[0][0]; reversed.inputs[0][0] = t;
    assert.equal(Ghost.verify(reversed, Cars).ok, false, 'non-monotonic input ticks fail verification');
  }

  const wrongPhysics = JSON.parse(JSON.stringify(ghost));
  wrongPhysics.meta.physicsVersion = Physics.VERSION + 1;
  assert.equal(Ghost.verify(wrongPhysics, Cars).reason, 'physics version mismatch', 'a run from another physics version is not comparable');

  // The tune hole, demonstrated rather than asserted in the abstract: this
  // forged recording passes Ghost.verify and only the server-side tune check
  // stops it.
  const juiced = buildGhost({ ticks: 180, tune: { power: 50, grip: 50, weight: 0.7, handbrake: 1 } });
  assert.ok(Ghost.verify(juiced, Cars).ok, 'a 50x-power recording is internally consistent, so verify() accepts it');
  assert.ok(scoreReplay(juiced).score > measured.score * 2, 'and it scores far higher than an honest run');
  assert.match(String(tuneProblem(juiced.meta.tune)), /out of range/, 'the server-side tune check is what rejects it');

  // ---- daily challenge ----------------------------------------------------
  const a = dailyChallenge('2026-10-09'), b = dailyChallenge('2026-10-09'), c = dailyChallenge('2026-10-10');
  assert.deepEqual(a, b, 'the same UTC date always produces the same challenge');
  assert.notDeepEqual(a.trackId + a.carId + a.mode + a.weather, c.trackId + c.carId + c.mode + c.weather, 'a different date produces a different challenge');
  assert.ok(Cars.CARS[a.carId], 'the challenge car is a real car');
  assert.equal(a.physicsVersion, Physics.VERSION, 'the challenge pins the physics version');
  assert.notEqual(a.trackId, 'lot', 'the sandbox car park is not a ranked challenge track');
  Object.keys(a.tune).forEach((key) => {
    assert.ok(a.tune[key] >= TUNE_MIN && a.tune[key] <= TUNE_MAX, 'the challenge setup is itself inside the legal tune range');
  });
  assert.equal(dailyChallenge('not-a-date').date, dailyChallenge().date, 'a malformed date falls back to today rather than seeding from attacker input');
  assert.equal(dailyChallenge('2026-10-09').date, '2026-10-09');

  // ---- leaderboard handles ------------------------------------------------
  const handle = handleFrom(Random.create('user-123:0:'));
  assert.match(handle, /^[A-Za-z]+\d\d$/, 'a handle is a generated name plus a number');
  assert.ok(!handle.includes('@'), 'a handle can never be an email address');
  assert.equal(handleFrom(Random.create('user-123:0:')), handle, 'handle generation is reproducible from the account id');
  assert.notEqual(handleFrom(Random.create('user-124:0:')), handle, 'two accounts get different handles');

  console.log('PASS: operation ids, server-side prices, garage normalising, tune validation (including the Ghost.verify tune hole), replay-derived scoring, forged-recording rejection, daily challenge seeding and generated handles.');

  /* Build a genuine recording the way the live loop must: quantise the input
     FIRST, step the physics with that exact value, then record it. Quantising
     only inside the recorder would make the replay drive slightly different
     numbers and the two diverge within a couple of seconds. */
  function buildGhost(opts) {
    const meta = {
      seed: 12345,
      carId: opts.carId || 'sport',
      trackId: opts.trackId || 'club',
      weather: opts.weather || 'dry',
      difficulty: opts.difficulty || 'standard',
      tune: opts.tune || null,
      startedAt: 0
    };
    const rec = Ghost.record(meta);
    let car = Cars.get(meta.carId);
    if (meta.tune) car = Object.assign({}, car, { tune: meta.tune });
    const state = Physics.createState(car);
    const env = { difficulty: meta.difficulty, weather: meta.weather };
    for (let tick = 1; tick <= opts.ticks; tick++) {
      // Full throttle with a slow steering sweep: enough variety to produce a
      // handful of input entries, nothing like one change per tick.
      const input = Ghost.quantize({ throttle: 1, brake: 0, steer: Math.sin(tick / 45) * 0.3, handbrake: 0 });
      Physics.step(state, car, input, env, FixedStep.STEP);
      rec.record(tick, input, state);
    }
    return rec.finish({ score: 0 });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
