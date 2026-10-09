/* Adversarial integration tests for ranked run submission and the leaderboard.
 *
 * The threat model is a player with the shipped JS open in a debugger. They can
 * read every constant, recompute the ghost hash chain (it is unkeyed FNV-1a) and
 * hand the server any recording they like. So nothing here trusts the client's
 * claimed score, its chosen car or its setup: the server re-simulates the
 * recorded inputs with the same physics modules the browser used and scores what
 * it gets. Run against `npx wrangler dev --port 8787 --local`.
 */
const assert = require('node:assert/strict');

const Cars = require('../racing/data/cars.js');
const Ghost = require('../racing/game/ghost.js');
const Physics = require('../racing/core/vehicle-physics.js');
const FixedStep = require('../racing/core/fixed-step.js');

const BASE = 'http://localhost:8787/api/';

(async () => {
  // Three accounts, so one suite's rate limiting does not starve another's.
  const honest = await signup('racing-run-honest');
  const forger = await signup('racing-run-forger');
  const flooder = await signup('racing-run-flood');
  const A = api(honest.token), F = api(forger.token), L = api(flooder.token);

  // ---- a genuine run is accepted and scored by the server ----------------
  let start = await A('POST', 'racing/nonce', {});
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const challenge = start.body.challenge;
  assert.ok(challenge.trackId && challenge.carId, 'the nonce hands back the server-seeded challenge');
  assert.equal(challenge.physicsVersion, Physics.VERSION);

  const good = buildGhost(challenge, { ticks: 240 });
  let run = await A('POST', 'racing/submit', { nonce: start.body.nonce, ghost: good });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.body.accepted, true, 'an honest run is accepted: ' + JSON.stringify(run.body.flags));
  assert.equal(run.body.withheld, false);
  assert.deepEqual(run.body.flags, [], 'an honest run carries no anomaly flags');
  assert.ok(run.body.score > 0, 'the server derived a score');
  assert.ok(run.body.distanceM > 0 && run.body.topKph > 0, 'the server measured the run itself');
  assert.equal(run.body.trackId, challenge.trackId, 'the run is recorded against the challenge track');
  assert.ok(run.body.payout > 0, 'an accepted run pays out');
  const honestScore = run.body.score;

  // The payout went through the ledger, so the balance moved with it.
  const garage = (await A('GET', 'racing/garage')).body.garage;
  assert.equal(garage.cash, run.body.payout, 'the run payout is a ledger credit');
  assert.ok(garage.dailyDone[challenge.date], 'the daily challenge is marked complete for that UTC date');

  // ---- the nonce is single use -------------------------------------------
  const reuse = await A('POST', 'racing/submit', { nonce: start.body.nonce, ghost: good });
  assert.equal(reuse.status, 409, 'a nonce cannot be used twice');
  assert.equal(reuse.body.reason, 'already used', JSON.stringify(reuse.body));

  // ---- a run with no nonce, or someone else's, is refused ----------------
  let r = await A('POST', 'racing/submit', { ghost: good });
  assert.equal(r.status, 400, 'a submission without a nonce is refused');
  r = await A('POST', 'racing/submit', { nonce: 'f'.repeat(64), ghost: good });
  assert.equal(r.status, 409, 'an invented nonce is refused');
  assert.equal(r.body.reason, 'unknown');
  // A nonce issued to one account cannot be spent by another: the claim is
  // scoped to the user id, not just to the nonce.
  const lent = await F('POST', 'racing/nonce', {});
  r = await A('POST', 'racing/submit', { nonce: lent.body.nonce, ghost: good });
  assert.equal(r.status, 409, "another account's nonce is not usable");
  assert.equal(r.body.reason, 'unknown', 'and it is not even acknowledged as existing');

  // ---- repeated identical evidence ---------------------------------------
  // Drive one good lap, then replay that same file against every fresh nonce
  // you can get. The database refuses it on a unique index rather than the
  // application remembering to look.
  start = await A('POST', 'racing/nonce', {});
  r = await A('POST', 'racing/submit', { nonce: start.body.nonce, ghost: good });
  assert.equal(r.status, 409, 'byte-identical replay evidence cannot be submitted twice');
  assert.equal(r.body.reason, 'repeated identical evidence', JSON.stringify(r.body));

  // ---- unauthenticated ---------------------------------------------------
  const anon = await fetch(BASE + 'racing/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce: 'a'.repeat(64), ghost: good }) });
  assert.equal(anon.status, 401, 'ranked submission requires authentication');
  const anonBoard = await fetch(BASE + 'racing/leaderboard');
  assert.equal(anonBoard.status, 401, 'the leaderboard is behind the session too');

  console.log('PASS (part 1): honest run accepted and server-scored, ledger payout, single-use nonces, cross-account nonce refused, repeated identical evidence refused, auth required.');

  // ---- forgeries ---------------------------------------------------------
  // A fresh account per case, deliberately: the submission rate limit is tight
  // enough that running fifteen forgeries through one account trips it, which is
  // the limiter working rather than a reason to loosen it.
  const reject = async (mutate, expectReason, label) => {
    const who = await signup('racing-run-forge');
    const F = api(who.token);
    const s = await F('POST', 'racing/nonce', {});
    assert.equal(s.status, 200, 'nonce: ' + JSON.stringify(s.body));
    const ghost = buildGhost(s.body.challenge, { ticks: 180 });
    const body = mutate(ghost, s.body);
    const res = await F('POST', 'racing/submit', body.payload === undefined ? { nonce: s.body.nonce, ghost: body } : body.payload);
    assert.equal(res.status, body.expectStatus || 422, label + ' -> ' + JSON.stringify(res.body));
    if (expectReason) assert.match(String(res.body.reason), expectReason, label + ' reason: ' + res.body.reason);
    return res;
  };

  // The tune hole. Ghost.verify never inspects meta.tune, and Ghost.replay feeds
  // it straight into the physics, so a recording made with 50x power replays
  // perfectly self-consistently: every checkpoint matches and the hash chain is
  // intact. Only the server's own tune check stops it.
  await reject((g, s) => {
    const juiced = buildGhost(s.challenge, { ticks: 180, tune: { power: 50, grip: 50, weight: 0.7, handbrake: 1.4 } });
    return juiced;
  }, /out of range/, 'a 50x-power setup is refused even though the recording verifies');

  await reject((g) => { g.meta.tune = { nitrous: 3 }; return g; }, /unknown tuning field/, 'an invented tuning field is refused');
  await reject((g) => { g.meta.tune = { power: 'fast' }; return g; }, /non-numeric/, 'a stringly-typed tune value is refused');

  // Physics version separation: a run from a different model is not comparable
  // and must not share a board with runs from this one.
  await reject((g) => { g.meta.physicsVersion = Physics.VERSION + 1; return g; }, /physics version/, 'a run from another physics version is refused');
  await reject((g) => { g.meta.format = 99; return g; }, /format/, 'a run in an unknown ghost format is refused');

  // The run must be the one the nonce was issued for, or a nonce for today's
  // hard challenge gets spent on an easy setup of the client's choosing.
  await reject((g, s) => {
    const other = Cars.ORDER.find((id) => id !== s.challenge.carId);
    return buildGhost({ ...s.challenge, carId: other }, { ticks: 180 });
  }, /car does not match/, 'a different car than the challenge is refused');
  await reject((g) => { g.meta.seed = 999999; return g; }, /seed does not match/, 'a different seed than the challenge is refused');

  // Edited recordings.
  await reject((g) => { g.checkpoints[1].x += 500; return g; }, /diverged|hash|checkpoint/, 'a moved checkpoint is refused');
  await reject((g) => { g.ticks = 30; return g; }, /./, 'shortening the run to fake a time is refused');
  await reject((g) => {
    const t = g.inputs[1][0]; g.inputs[1][0] = g.inputs[0][0]; g.inputs[0][0] = t; return g;
  }, /monotonic|outside/, 'non-monotonic input ticks are refused');
  await reject((g) => { g.ticks = '600'; return g; }, /./, 'a stringly-typed tick count is refused');
  await reject((g) => { g.inputs.push([10, 1, 0, null, 0]); return g; }, /./, 'a null input value is refused rather than reaching the physics');
  await reject((g) => { g.chain = 'deadbeef'; return g; }, /hash/, 'a rewritten final hash is refused');
  await reject((g) => { g.checkpoints = g.checkpoints.slice(0, 1); return g; }, /checkpoint count/, 'dropped checkpoints are refused');
  await reject((g) => { g.meta = null; return g; }, /malformed/, 'a recording with no metadata is refused');
  await reject((g) => {
    // Checkpoint ticks that go backwards get a clear reason of their own.
    if (g.checkpoints.length > 1) { const t = g.checkpoints[0].tick; g.checkpoints[0].tick = g.checkpoints[1].tick; g.checkpoints[1].tick = t; }
    return g;
  }, /monotonic|checkpoint/, 'non-monotonic checkpoint ticks are refused');

  console.log('PASS (part 2): tune forgery (the Ghost.verify hole), physics-version separation, challenge/car/seed binding, and every edited-recording case refused.');

  // ---- oversized evidence ------------------------------------------------
  // Checked on the raw body length, before parsing, so an enormous payload
  // costs the server a length comparison rather than a JSON parse and a replay.
  const big = await F('POST', 'racing/nonce', {});
  const bloated = buildGhost(big.body.challenge, { ticks: 180 });
  bloated.padding = 'x'.repeat(300 * 1024);
  const oversize = await fetch(BASE + 'racing/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + forger.token },
    body: JSON.stringify({ nonce: big.body.nonce, ghost: bloated })
  });
  assert.equal(oversize.status, 413, 'an oversized replay is refused');

  // ---- a lying summary is flagged and withheld ---------------------------
  // The recording itself is genuine, so it verifies; the score attached to it is
  // not. The run is stored for audit but never displayed.
  const liar = await signup('racing-run-liar');
  const Li = api(liar.token);
  const liarHandle = (await Li('GET', 'racing/garage')).body.garage.handle;
  const s = await Li('POST', 'racing/nonce', {});
  const lying = buildGhost(s.body.challenge, { ticks: 200 });
  lying.summary = { score: 50000000 };
  const flaggedRun = await Li('POST', 'racing/submit', { nonce: s.body.nonce, ghost: lying });
  assert.equal(flaggedRun.status, 200, JSON.stringify(flaggedRun.body));
  assert.equal(flaggedRun.body.accepted, false, 'a run whose claimed score contradicts the replay is not accepted');
  assert.equal(flaggedRun.body.withheld, true, 'it is withheld');
  assert.ok(flaggedRun.body.flags.some((f) => /claimed score/.test(f)), 'and flagged for the mismatch: ' + JSON.stringify(flaggedRun.body.flags));
  assert.ok(flaggedRun.body.score < 50000000, 'the stored score is the one the server measured, not the one claimed');
  assert.equal(flaggedRun.body.payout, 0, 'a flagged run pays nothing');

  // ---- the leaderboard shows handles, and only unflagged runs ------------
  const board = await A('GET', 'racing/leaderboard?date=' + challenge.date + '&track=' + challenge.trackId);
  assert.equal(board.status, 200, JSON.stringify(board.body));
  const names = board.body.entries.map((e) => e.handle);
  assert.ok(board.body.entries.length >= 1, 'the honest run is on the board');
  assert.ok(names.includes((await A('GET', 'racing/garage')).body.garage.handle), 'under the generated handle');
  assert.ok(!names.includes(liarHandle), 'a flagged run is withheld from the board, not merely ranked lower');
  const serialized = JSON.stringify(board.body);
  [honest.email, forger.email, liar.email].forEach((email) => {
    assert.ok(!serialized.includes(email), 'the leaderboard never exposes an email address');
  });
  assert.ok(!serialized.includes('@'), 'no entry on the board contains an email at all');
  board.body.entries.forEach((e) => {
    assert.ok(typeof e.handle === 'string' && e.handle.length < 40, 'entries carry a short handle');
    assert.ok(Number.isFinite(e.score) && Number.isFinite(e.seconds), 'entries carry a score and a time');
  });
  assert.equal(board.body.entries[0].score, Math.max(...board.body.entries.map((e) => e.score)), 'the board is ordered by score');
  assert.ok(board.body.entries.some((e) => e.score === honestScore), 'the honest score on the board is the one the server derived');

  // A board for a different physics version or an unknown track is empty rather
  // than mixing incomparable runs.
  const otherBoard = await A('GET', 'racing/leaderboard?date=2020-01-01&track=' + challenge.trackId);
  assert.deepEqual(otherBoard.body.entries, [], 'a day with no runs has an empty board');

  console.log('PASS (part 3): oversized evidence refused, lying summaries flagged and withheld, leaderboard shows generated handles only and never an email.');

  // ---- rate limiting -----------------------------------------------------
  let limited = null;
  for (let i = 0; i < 20 && !limited; i++) {
    const res = await L('POST', 'racing/submit', { nonce: 'b'.repeat(64), ghost: {} });
    if (res.status === 429) limited = res;
  }
  assert.ok(limited, 'run submission is rate limited, so a forger cannot brute-force the validator');
  assert.ok(limited.body.retryAfter > 0, 'a rate-limited submitter is told when to come back');

  // Nonce issuing is limited too, or the submission limit is sidestepped by
  // hoarding nonces.
  let nonceLimited = null;
  for (let i = 0; i < 30 && !nonceLimited; i++) {
    const res = await L('POST', 'racing/nonce', {});
    if (res.status === 429) nonceLimited = res;
  }
  assert.ok(nonceLimited, 'nonce issuing is rate limited');

  await A('POST', 'logout', {});
  console.log('PASS (part 4): submission and nonce rate limiting.');
  console.log('PASS: racing run validation and leaderboard integration.');
})().catch((e) => { console.error(e); process.exitCode = 1; });

// ---- helpers ---------------------------------------------------------------
/* Build a genuine recording for a challenge, the way the live loop must: the
   input is quantised FIRST, the physics is stepped with that exact value, and
   that same value is recorded. Quantising only inside the recorder makes the
   replay drive slightly different numbers and the two diverge within seconds. */
function buildGhost(challenge, opts) {
  const meta = {
    format: Ghost.FORMAT,
    physicsVersion: Physics.VERSION,
    seed: challenge.seed,
    carId: challenge.carId,
    trackId: challenge.trackId,
    weather: challenge.weather || 'dry',
    difficulty: challenge.difficulty || 'standard',
    tune: opts.tune === undefined ? (challenge.tune || null) : opts.tune,
    startedAt: 0
  };
  const rec = Ghost.record(meta);
  // The recorder rebuilds meta itself, so keep the two in step.
  Object.assign(rec.meta, meta);
  rec.chain = Ghost.hash(JSON.stringify(rec.meta));
  let car = Cars.get(meta.carId);
  if (meta.tune) car = Object.assign({}, car, { tune: meta.tune });
  const state = Physics.createState(car);
  const env = { difficulty: meta.difficulty, weather: meta.weather };
  for (let tick = 1; tick <= opts.ticks; tick++) {
    const input = Ghost.quantize({ throttle: 1, brake: 0, steer: Math.sin(tick / 45) * 0.3, handbrake: 0 });
    Physics.step(state, car, input, env, FixedStep.STEP);
    rec.record(tick, input, state);
  }
  return rec.finish({});
}

async function signup(tag) {
  const email = tag + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '@example.com';
  const r = await fetch(BASE + 'signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Local-test-only-9281' }) });
  const j = await r.json();
  assert.ok(r.ok, 'signup failed: ' + JSON.stringify(j));
  return { token: j.token, email };
}
function api(token) {
  return async (method, path, body) => {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let parsed = {};
    try { parsed = await r.json(); } catch { parsed = {}; }
    return { status: r.status, body: parsed };
  };
}
