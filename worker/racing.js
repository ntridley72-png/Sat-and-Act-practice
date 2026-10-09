/* Racing v2: server-owned economy, run validation and leaderboard.
 *
 * Why this exists: `/api/progress` merged the garage by unioning unlocks and
 * taking max(cash). max() is not a merge. It silently restores money the player
 * legitimately spent (buy a $6,200 car on the phone, open the laptop whose cache
 * still says $9,000, and the car is free), and it duplicates earnings, because
 * two devices that each earned $500 from $1,000 report $1,500 and the account
 * keeps $1,500 instead of $2,000 — or $1,500 instead of $1,500 spent twice.
 * There is no arithmetic on two balances that is correct, because a balance is
 * not a value to merge; it is the running total of a sequence of events.
 *
 * So the server keeps the sequence. Every purchase, reward, migration credit and
 * scored-run debit is an append-only row in `racing_ledger` keyed by a unique
 * client-supplied operation id, the balance moves in the same transaction as the
 * row, and replaying an operation id returns the original result instead of
 * doing it again. A client never adds balances, and after the one-time legacy
 * import the client's own cash figure is never read again.
 *
 * Run submission re-simulates the player's recorded inputs with the same physics
 * modules the browser used, and scores the result the server produced. The
 * client's claimed score is only ever compared, never trusted.
 */

import Cars from "../racing/data/cars.js";
import Ghost from "../racing/game/ghost.js";
import Random from "../racing/core/random.js";
import Physics from "../racing/core/vehicle-physics.js";
import FixedStep from "../racing/core/fixed-step.js";

export const GARAGE_SCHEMA = 4;

// ---- catalogue -------------------------------------------------------------
// Prices live on the server. The workshop renders them into `data-price`
// attributes and pays from `b.dataset.price`, so a client-quoted price is a
// price the player chose. Nothing below is read from the request.
const KIT_PRICES = { stock: 0, street: 400, wide: 1500 };
const WING_PRICES = { none: 0, lip: 150, duck: 300, gt: 600 };
const TRACK_IDS = ["oval", "club", "tech", "canyon", "harbor", "ridge", "lot"];
// Tracks beyond the starting three are earned, not bought, so they are unlocked
// by the ledger (a reward) rather than priced.
const FREE_TRACKS = ["oval", "club", "lot"];
const WEATHERS = ["dry", "wet"];
const MODES = ["circuit", "traffic", "drift"];
const DIFFICULTIES = ["relaxed", "standard", "pro"];

// The tuning sliders in the workshop run 0.70 to 1.40 in steps of 0.05. A tune
// outside that is not a setup, it is an edited save file.
const TUNE_KEYS = ["power", "grip", "weight", "handbrake"];
const TUNE_MIN = 0.7, TUNE_MAX = 1.4;

function carPrice(id) {
  const car = Cars.CARS[id];
  return car ? Math.max(0, Math.round(Number(car.unlockPrice) || 0)) : null;
}
function itemPrice(kind, id) {
  if (kind === "car") return carPrice(id);
  if (kind === "kit") return Object.prototype.hasOwnProperty.call(KIT_PRICES, id) ? KIT_PRICES[id] : null;
  if (kind === "wing") return Object.prototype.hasOwnProperty.call(WING_PRICES, id) ? WING_PRICES[id] : null;
  return null;
}
const OWNED_LIST = { car: "cars", kit: "kits", wing: "wings" };

// ---- limits ----------------------------------------------------------------
const MAX_CASH = 100_000_000;          // a balance past this is a bug, not a player
const MAX_EVIDENCE_BYTES = 256 * 1024;
const NONCE_TTL_MS = 10 * 60 * 1000;
const MAX_TOKEN_CONVERT = 500;
const CASH_PER_TOKEN = 250;
const RATE = {                          // per user, per fixed window
  nonce: { n: 20, minutes: 10 },
  submit: { n: 12, minutes: 10 },
  economy: { n: 120, minutes: 10 }
};
// Absolute sanity ceilings on what the server itself derived. The re-simulation
// already produces only physically reachable states, so these can fire only if
// the physics model changes under us -- which is exactly when a leaderboard
// should stop accepting runs rather than quietly record nonsense.
const MAX_PLAUSIBLE_KPH = 450;
const MAX_PLAUSIBLE_SCORE = 5_000_000;
// A replayed run and the client's own summary are allowed to disagree by this
// much, to absorb last-bit float differences between two JS engines.
const SCORE_TOLERANCE = 0.02;

// ---- small helpers ---------------------------------------------------------
function clampInt(value, lo, hi) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}
function safeJson(text, fallback) {
  try { const v = JSON.parse(text); return v && typeof v === "object" ? v : fallback; } catch { return fallback; }
}
function strList(value, max) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => typeof v === "string" && v.length > 0 && v.length < 80))].slice(0, max || 200);
}
async function sha256(s) {
  const bits = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexBytes(n) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function utcDate(at) {
  return new Date(at == null ? Date.now() : at).toISOString().slice(0, 10);
}
// An operation id must be the client's own idea, long enough not to collide by
// accident across that account's devices. A UUID satisfies this.
function validOpId(value) {
  const id = String(value == null ? "" : value);
  return /^[A-Za-z0-9_.:-]{16,120}$/.test(id) ? id : null;
}

// ---- leaderboard identity --------------------------------------------------
// Public boards show a generated handle. The raw email never leaves the account
// endpoints: it is the player's real-world identity and a lot of these players
// are children.
const HANDLE_ADJECTIVES = ["Swift", "Calm", "Bright", "Quiet", "Bold", "Keen", "Steady", "Rapid", "Sharp", "Clear", "Brave", "Sly", "Deft", "Lucky", "Tidy", "Quick"];
const HANDLE_NOUNS = ["Falcon", "Otter", "Comet", "Maple", "Harbor", "Ridge", "Ember", "Lantern", "Pebble", "Cedar", "Beacon", "Willow", "Compass", "Quarry", "Thistle", "Meadow"];
function handleFrom(stream) {
  return stream.pick(HANDLE_ADJECTIVES) + stream.pick(HANDLE_NOUNS) + stream.int(10, 99);
}

// ---- daily challenge -------------------------------------------------------
/* Seeded by UTC date alone, so every player on a given day gets the same setup
   and the server can recompute it for a submission without having stored it. The
   client is told what the challenge is; it does not get to say. */
export function dailyChallenge(dateStr) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || "")) ? dateStr : utcDate();
  const stream = Random.create("funsat-daily-v1-" + date);
  // Drawn in a fixed order, so adding a field later cannot reshuffle the ones
  // before it and change today's challenge retroactively.
  const trackId = stream.pick(TRACK_IDS.filter((t) => t !== "lot"));
  const carId = stream.pick(Cars.ORDER);
  const mode = stream.pick(MODES);
  const weather = stream.pick(WEATHERS);
  const difficulty = stream.pick(DIFFICULTIES);
  const tune = {};
  TUNE_KEYS.forEach((key) => { tune[key] = Math.round(stream.float(0.85, 1.25) * 20) / 20; });
  return {
    date,
    seed: Random.hashSeed("funsat-daily-v1-" + date) >>> 0,
    trackId, carId, mode, weather, difficulty, tune,
    physicsVersion: Physics.VERSION,
    ghostFormat: Ghost.FORMAT
  };
}

// ---- garage ----------------------------------------------------------------
function emptyGarageData() {
  return {
    cars: ["sport"],                 // the starter car is owned from the start
    kits: ["stock"],
    wings: ["none"],
    tracks: FREE_TRACKS.slice(),
    achievements: [],
    dailyDone: {},                   // { "2026-10-09": runId }
    prefs: {}                        // { field: { value, changedAt, deviceId } }
  };
}
function normalizeGarageData(raw) {
  const base = emptyGarageData();
  const data = raw && typeof raw === "object" ? raw : {};
  const out = {
    cars: [...new Set(base.cars.concat(strList(data.cars).filter((id) => !!Cars.CARS[id])))],
    kits: [...new Set(base.kits.concat(strList(data.kits).filter((id) => id in KIT_PRICES)))],
    wings: [...new Set(base.wings.concat(strList(data.wings).filter((id) => id in WING_PRICES)))],
    tracks: [...new Set(base.tracks.concat(strList(data.tracks).filter((id) => TRACK_IDS.includes(id))))],
    achievements: strList(data.achievements, 300),
    dailyDone: {},
    prefs: {}
  };
  const done = data.dailyDone && typeof data.dailyDone === "object" ? data.dailyDone : {};
  Object.keys(done).slice(-400).forEach((key) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof done[key] === "string" && done[key].length < 80) out.dailyDone[key] = done[key];
  });
  const prefs = data.prefs && typeof data.prefs === "object" ? data.prefs : {};
  Object.keys(prefs).slice(0, 80).forEach((key) => {
    const p = prefs[key];
    if (p && typeof p === "object" && Number.isFinite(Number(p.changedAt))) {
      out.prefs[key] = { value: p.value, changedAt: Math.round(Number(p.changedAt)), deviceId: String(p.deviceId || "").slice(0, 64) };
    }
  });
  return out;
}

async function loadGarage(env, user) {
  const row = await env.DB.prepare("SELECT schema_version, cash, revision, data, handle, legacy_imported, created_at FROM racing_garage WHERE user_id = ?").bind(user.id).first();
  if (row) {
    return {
      exists: true,
      schemaVersion: row.schema_version,
      cash: Number(row.cash) || 0,
      revision: Number(row.revision) || 0,
      data: normalizeGarageData(safeJson(row.data, {})),
      handle: row.handle || null,
      legacyImported: !!row.legacy_imported
    };
  }
  return { exists: false, schemaVersion: GARAGE_SCHEMA, cash: 0, revision: 0, data: emptyGarageData(), handle: null, legacyImported: false };
}

/* Create the row if it is missing, and give the account a leaderboard handle.
   Handles are generated, collision-checked and never derived from the email. */
async function ensureGarage(env, user) {
  let garage = await loadGarage(env, user);
  if (garage.exists && garage.handle) return garage;
  const now = Date.now();
  if (!garage.exists) {
    await env.DB.prepare("INSERT INTO racing_garage (user_id, schema_version, cash, revision, data, handle, legacy_imported, created_at, updated_at) VALUES (?, ?, 0, 0, ?, NULL, 0, ?, ?) ON CONFLICT(user_id) DO NOTHING")
      .bind(user.id, GARAGE_SCHEMA, JSON.stringify(emptyGarageData()), now, now).run();
  }
  // The handle index is unique, so a taken name fails the update rather than
  // two accounts sharing a board entry. Re-draw from a stream seeded by the
  // attempt, not by Math.random, so this is reproducible when it goes wrong.
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = handleFrom(Random.create(user.id + ":" + attempt + ":" + (attempt > 3 ? hexBytes(4) : "")));
    try {
      const r = await env.DB.prepare("UPDATE racing_garage SET handle = ?, updated_at = ? WHERE user_id = ? AND handle IS NULL").bind(candidate, now, user.id).run();
      if (r.meta.changes) break;
      break; // somebody already set a handle for this user; reload it below
    } catch { /* unique collision: draw again */ }
  }
  garage = await loadGarage(env, user);
  return garage;
}

function garageView(garage) {
  return {
    schemaVersion: GARAGE_SCHEMA,
    revision: garage.revision,
    cash: garage.cash,
    handle: garage.handle,
    legacyImported: garage.legacyImported,
    owned: { cars: garage.data.cars, kits: garage.data.kits, wings: garage.data.wings, tracks: garage.data.tracks },
    achievements: garage.data.achievements,
    dailyDone: garage.data.dailyDone,
    prefs: garage.data.prefs,
    catalog: { cars: catalogCars(), kits: KIT_PRICES, wings: WING_PRICES, tracks: TRACK_IDS, freeTracks: FREE_TRACKS, tune: { min: TUNE_MIN, max: TUNE_MAX, keys: TUNE_KEYS } }
  };
}
function catalogCars() {
  const out = {};
  Cars.ORDER.forEach((id) => { out[id] = { name: Cars.CARS[id].name, price: carPrice(id), starter: !!Cars.CARS[id].starter }; });
  return out;
}

// ---- rate limiting ---------------------------------------------------------
async function rateLimited(env, userId, bucket) {
  const conf = RATE[bucket];
  const win = Math.floor(Date.now() / (conf.minutes * 60000));
  const row = await env.DB.prepare("INSERT INTO racing_rate (user_id, bucket, win, n) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, bucket, win) DO UPDATE SET n = n + 1 RETURNING n")
    .bind(userId, bucket, win).first();
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM racing_rate WHERE win < ?").bind(win - 2).run();
  if (row && row.n > conf.n) {
    return { retryAfter: Math.ceil(((win + 1) * conf.minutes * 60000 - Date.now()) / 1000) };
  }
  return null;
}

// ---- the ledger ------------------------------------------------------------
/* Apply one economy operation.
 *
 * `plan(garage)` inspects the current state and returns either
 *   { error, status }                       -- refuse, write nothing
 *   { amount, kind, itemId, data, result }  -- a signed balance move plus the
 *                                              garage data it leaves behind
 *
 * Atomicity comes from D1's batch, which runs its statements in one
 * transaction. Both statements are guarded on the revision that was read, and
 * `INSERT ... SELECT ... WHERE revision = ?` is what makes the guard safe: if
 * another device moved the revision first, the insert matches no rows and the
 * update changes none, so the whole operation no-ops and is retried against
 * fresh state. Guarding only the UPDATE would commit a ledger row for a balance
 * change that never happened.
 *
 * Idempotency comes from the (user_id, op_id) primary key. A replay makes the
 * insert raise, and the stored `result` is returned verbatim -- the same answer,
 * not a second purchase.
 */
async function applyOperation(env, user, opId, plan) {
  const replayed = await env.DB.prepare("SELECT kind, item_id, amount, balance_after, result FROM racing_ledger WHERE user_id = ? AND op_id = ?").bind(user.id, opId).first();
  if (replayed) return { status: 200, body: { ...safeJson(replayed.result, {}), replayed: true, cash: Number(replayed.balance_after) || 0 } };

  for (let attempt = 0; attempt < 6; attempt++) {
    const garage = await ensureGarage(env, user);
    const decided = await plan(garage);
    if (decided.error) return { status: decided.status || 400, body: { error: decided.error, cash: garage.cash, revision: garage.revision } };

    const amount = Math.round(Number(decided.amount) || 0);
    const next = garage.cash + amount;
    if (next < 0) return { status: 409, body: { error: "Not enough garage cash.", cash: garage.cash, revision: garage.revision, needed: -amount } };
    if (next > MAX_CASH) return { status: 409, body: { error: "That would exceed the maximum balance.", cash: garage.cash, revision: garage.revision } };

    const data = normalizeGarageData(decided.data || garage.data);
    const result = { ...(decided.result || {}), ok: true, cash: next, revision: garage.revision + 1 };
    const now = Date.now();
    let update;
    try {
      const batch = await env.DB.batch([
        env.DB.prepare("INSERT INTO racing_ledger (user_id, op_id, kind, item_id, amount, balance_after, result, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM racing_garage WHERE user_id = ? AND revision = ?")
          .bind(user.id, opId, decided.kind || "adjust", decided.itemId || null, amount, next, JSON.stringify(result), now, user.id, garage.revision),
        env.DB.prepare("UPDATE racing_garage SET cash = ?, data = ?, revision = revision + 1, schema_version = ?, updated_at = ?, legacy_imported = ? WHERE user_id = ? AND revision = ?")
          .bind(next, JSON.stringify(data), GARAGE_SCHEMA, now, decided.legacyImported == null ? (garage.legacyImported ? 1 : 0) : (decided.legacyImported ? 1 : 0), user.id, garage.revision),
        ...(decided.extra || [])
      ]);
      update = batch[1];
    } catch (e) {
      // Either the op id was inserted concurrently (a replay that raced this
      // request) or an `extra` statement hit a constraint. Both are answered by
      // the stored result if there is one.
      const existing = await env.DB.prepare("SELECT balance_after, result FROM racing_ledger WHERE user_id = ? AND op_id = ?").bind(user.id, opId).first();
      if (existing) return { status: 200, body: { ...safeJson(existing.result, {}), replayed: true, cash: Number(existing.balance_after) || 0 } };
      if (decided.onConflict) return decided.onConflict(e);
      throw e;
    }
    if (update && update.meta.changes) return { status: 200, body: result };
    // Lost the revision race; nothing was written. Re-read and decide again,
    // which is what makes two devices buying at once resolve to one purchase
    // and one "already owned" rather than two debits.
  }
  return { status: 409, body: { error: "The garage is being updated on another device. Try again." } };
}

// ---- legacy v3 import ------------------------------------------------------
/* The one and only time the client's own cash figure is believed.
 *
 * It is read from the account's stored progress record, not from the request
 * body, so a client cannot name its own opening balance. The ledger row makes it
 * happen exactly once: a replay of the operation id, or a second import attempt
 * after `legacy_imported` is set, both return the original result. */
async function importLegacy(env, user, opId) {
  return applyOperation(env, user, opId, async (garage) => {
    if (garage.legacyImported) return { error: "Legacy progress was already imported.", status: 409 };
    const row = await env.DB.prepare("SELECT data FROM progress WHERE user_id = ?").bind(user.id).first();
    const progress = row ? safeJson(row.data, {}) : {};
    const legacy = (progress.profile && progress.profile.garage) || {};
    // Several legacy ids map onto one launch car; migrateUnlocks grants it once.
    const cars = Cars.migrateUnlocks(strList(legacy.unlocked));
    const kits = strList(legacy.ownedKits).filter((id) => id in KIT_PRICES);
    const wings = strList(legacy.ownedWings).filter((id) => id in WING_PRICES);
    const credit = clampInt(legacy.cash, 0, MAX_CASH);
    const data = {
      ...garage.data,
      cars: [...new Set(garage.data.cars.concat(cars))],
      kits: [...new Set(garage.data.kits.concat(kits))],
      wings: [...new Set(garage.data.wings.concat(wings))]
    };
    return {
      kind: "migration", itemId: "legacy-v3", amount: credit, data, legacyImported: true,
      result: { imported: { cash: credit, cars: data.cars.length, kits: data.kits.length, wings: data.wings.length } }
    };
  });
}

// ---- purchases and rewards -------------------------------------------------
async function purchase(env, user, body) {
  const opId = validOpId(body.opId);
  if (!opId) return { status: 400, body: { error: "A purchase needs an operation id." } };
  const kind = String(body.kind || "");
  const itemId = String(body.itemId || "").slice(0, 80);
  const listKey = OWNED_LIST[kind];
  if (!listKey) return { status: 400, body: { error: "Unknown purchase type." } };
  const price = itemPrice(kind, itemId);
  if (price == null) return { status: 400, body: { error: "That item isn't for sale." } };

  return applyOperation(env, user, opId, async (garage) => {
    if (garage.data[listKey].includes(itemId)) {
      // Not an error worth a failed request: two devices racing the same
      // purchase must produce one debit and one benign "you already own it".
      return { kind: "purchase", itemId, amount: 0, data: garage.data, result: { alreadyOwned: true, item: { kind, itemId, price } } };
    }
    if (garage.cash < price) return { error: "Not enough garage cash.", status: 409 };
    const data = { ...garage.data, [listKey]: garage.data[listKey].concat(itemId) };
    return { kind: "purchase", itemId, amount: -price, data, result: { purchased: { kind, itemId, price } } };
  });
}

/* Turn practice tokens into garage cash.
 *
 * The amount is checked against the tokens actually in the account's progress
 * record and debited there in the same transaction, so the conversion cannot be
 * run twice for one token -- the ledger stops the replay, and the token debit
 * stops a fresh operation id from spending tokens that are gone. */
async function convertTokens(env, user, body) {
  const opId = validOpId(body.opId);
  if (!opId) return { status: 400, body: { error: "A conversion needs an operation id." } };
  const want = clampInt(body.tokens, 1, MAX_TOKEN_CONVERT);
  if (!Number.isFinite(Number(body.tokens)) || Number(body.tokens) < 1) return { status: 400, body: { error: "Convert at least one token." } };

  return applyOperation(env, user, opId, async (garage) => {
    const row = await env.DB.prepare("SELECT data, updated_at FROM progress WHERE user_id = ?").bind(user.id).first();
    if (!row) return { error: "No saved progress to take tokens from.", status: 409 };
    const progress = safeJson(row.data, {});
    const have = clampInt((progress.profile && progress.profile.tokens) || 0, 0, 1_000_000);
    if (have < want) return { error: "Not enough practice tokens.", status: 409 };
    progress.profile = { ...(progress.profile || {}), tokens: have - want };
    const nextAt = Math.max(Date.now(), Number(row.updated_at) + 1);
    return {
      kind: "convert", itemId: "tokens", amount: want * CASH_PER_TOKEN, data: garage.data,
      result: { converted: { tokens: want, cash: want * CASH_PER_TOKEN, tokensLeft: have - want } },
      // Guarded on the progress row's own updated_at: if progress changed under
      // us the batch writes nothing and applyOperation retries.
      extra: [env.DB.prepare("UPDATE progress SET data = ?, updated_at = ? WHERE user_id = ? AND updated_at = ?")
        .bind(JSON.stringify(progress), nextAt, user.id, row.updated_at)]
    };
  });
}

// ---- run nonces ------------------------------------------------------------
async function issueNonce(env, user, body) {
  const limited = await rateLimited(env, user.id, "nonce");
  if (limited) return { status: 429, body: { error: "Too many run starts. Wait a moment.", retryAfter: limited.retryAfter } };
  const garage = await ensureGarage(env, user);
  const challenge = dailyChallenge(body.date);
  // A ranked run is driven on the server's challenge setup, not the client's
  // choice, so the nonce carries the setup and the submission is checked
  // against the nonce rather than against anything in the request body.
  const trackId = challenge.trackId, carId = challenge.carId;
  if (!garage.data.cars.includes(carId)) {
    // The daily challenge car is loaned for the challenge: it is the same for
    // everyone, so requiring ownership would make the board a rich list.
  }
  const nonce = hexBytes(32);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO racing_nonces (nonce_hash, user_id, challenge_date, track_id, car_id, physics_version, seed, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(await sha256(nonce), user.id, challenge.date, trackId, carId, Physics.VERSION, challenge.seed, now, now + NONCE_TTL_MS).run();
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM racing_nonces WHERE expires_at < ?").bind(now - 86400000).run();
  return { status: 200, body: { nonce, expiresAt: now + NONCE_TTL_MS, challenge } };
}

// ---- run validation --------------------------------------------------------
/* Is this tune a setup a player could have dialled in, or an edited file?
 *
 * This matters more than it looks. `Ghost.replay` does
 * `Object.assign({}, car, { tune: ghost.meta.tune })` and hands the result
 * straight to the physics, and `Ghost.verify` never looks at `tune` at all. A
 * recording made with power: 1000 replays perfectly self-consistently -- every
 * checkpoint matches, the hash chain is intact -- and posts an impossible time.
 * Re-simulation only proves a run is consistent with the inputs AND the car it
 * claims; the car has to be checked separately. */
function tuneProblem(tune) {
  if (tune == null) return null;
  if (typeof tune !== "object" || Array.isArray(tune)) return "tune is not a setup";
  const keys = Object.keys(tune);
  if (keys.length > TUNE_KEYS.length) return "unknown tuning fields";
  for (const key of keys) {
    if (!TUNE_KEYS.includes(key)) return "unknown tuning field " + key;
    const v = Number(tune[key]);
    if (typeof tune[key] !== "number" || !Number.isFinite(v)) return "non-numeric tuning value";
    if (v < TUNE_MIN - 1e-9 || v > TUNE_MAX + 1e-9) return "tuning value out of range";
  }
  return null;
}

/* Re-simulate and score. The score the client claims is never the score that is
   stored: this walks the replay and measures it. */
function scoreReplay(ghost) {
  let distance = 0, topKph = 0, prevX = null, prevY = null, maxAccel = 0, lastSpeed = 0;
  const step = FixedStep.STEP;
  Ghost.replay(ghost, Cars, {
    onTick: (state) => {
      if (prevX != null) distance += Math.hypot(state.x - prevX, state.y - prevY);
      prevX = state.x; prevY = state.y;
      const speed = Math.hypot(state.vx, state.vy);
      const kph = speed * 3.6;
      if (kph > topKph) topKph = kph;
      const accel = Math.abs(speed - lastSpeed) / step;
      if (accel > maxAccel) maxAccel = accel;
      lastSpeed = speed;
    }
  });
  return {
    distanceM: distance,
    topKph,
    maxAccel,
    seconds: ghost.ticks * step,
    score: Math.floor(distance + topKph * 2)
  };
}

async function submitRun(env, user, text) {
  if (text.length > MAX_EVIDENCE_BYTES) {
    return { status: 413, body: { error: "That replay is too large to check." } };
  }
  const body = safeJson(text, null);
  if (!body) return { status: 400, body: { error: "Bad request." } };
  const limited = await rateLimited(env, user.id, "submit");
  if (limited) return { status: 429, body: { error: "Too many run submissions. Wait a moment.", retryAfter: limited.retryAfter } };

  const nonce = String(body.nonce || "");
  if (!/^[0-9a-f]{64}$/.test(nonce)) return { status: 400, body: { error: "This run wasn't started properly. Start it again." } };
  const now = Date.now();
  // Single-use: claim the nonce with a conditional update, so two submissions
  // racing with one nonce cannot both pass. The unused+unexpired test is part of
  // the UPDATE, not a read followed by a write.
  const nonceHash = await sha256(nonce);
  const claim = await env.DB.prepare("UPDATE racing_nonces SET used_at = ? WHERE nonce_hash = ? AND user_id = ? AND used_at = 0 AND expires_at > ? RETURNING challenge_date, track_id, car_id, physics_version, seed")
    .bind(now, nonceHash, user.id, now).first();
  if (!claim) {
    const exists = await env.DB.prepare("SELECT used_at, expires_at FROM racing_nonces WHERE nonce_hash = ? AND user_id = ?").bind(nonceHash, user.id).first();
    const why = !exists ? "unknown" : exists.used_at ? "already used" : "expired";
    return { status: 409, body: { error: "This run can no longer be submitted (" + why + "). Start a new run.", reason: why } };
  }

  const ghost = body.ghost;
  const flags = [];
  const reject = (reason) => ({ status: 422, body: { error: "This run couldn't be verified.", reason } });

  if (!ghost || typeof ghost !== "object" || !ghost.meta || typeof ghost.meta !== "object") return reject("malformed");
  if (ghost.meta.physicsVersion !== Physics.VERSION) return reject("physics version mismatch");
  if (ghost.meta.format !== Ghost.FORMAT) return reject("ghost format mismatch");
  // The run must be the one the nonce was issued for. Otherwise a nonce for
  // today's hard challenge is spent on an easy track of the client's choosing.
  if (String(ghost.meta.carId || "") !== claim.car_id) return reject("car does not match the run that was started");
  if (String(ghost.meta.trackId || "") !== claim.track_id) return reject("track does not match the run that was started");
  if ((Number(ghost.meta.seed) >>> 0) !== (Number(claim.seed) >>> 0)) return reject("seed does not match the run that was started");

  const tuneBad = tuneProblem(ghost.meta.tune);
  if (tuneBad) return reject(tuneBad);

  // Checkpoint ticks must march forwards. Ghost.verify catches this indirectly
  // by comparing against its own strictly-increasing list, but a clear reason
  // beats "checkpoint tick mismatch at 3".
  if (Array.isArray(ghost.checkpoints)) {
    for (let i = 1; i < ghost.checkpoints.length; i++) {
      const a = ghost.checkpoints[i - 1], b = ghost.checkpoints[i];
      if (!a || !b || !(Number(b.tick) > Number(a.tick))) return reject("non-monotonic checkpoint ticks");
    }
  }

  // The expensive part: re-run the player's inputs through the same physics the
  // browser used and insist every checkpoint and hash matches.
  let verified;
  try { verified = Ghost.verify(ghost, Cars); } catch (e) { return reject("replay failed: " + String(e && e.message || e).slice(0, 80)); }
  if (!verified.ok) return reject(verified.reason);

  let measured;
  try { measured = scoreReplay(ghost); } catch (e) { return reject("scoring failed"); }

  if (!Number.isFinite(measured.score) || measured.score < 0) return reject("unscoreable run");
  if (measured.topKph > MAX_PLAUSIBLE_KPH) flags.push("impossible speed");
  if (measured.score > MAX_PLAUSIBLE_SCORE) flags.push("impossible score");
  // A claimed summary that disagrees with the replay is the client telling the
  // server a different story than its own recording does.
  const claimed = Number((ghost.summary && ghost.summary.score) != null ? ghost.summary.score : body.score);
  if (Number.isFinite(claimed) && Math.abs(claimed - measured.score) > Math.max(5, measured.score * SCORE_TOLERANCE)) {
    flags.push("claimed score does not match the replay");
  }

  const evidenceHash = await sha256(JSON.stringify({ meta: ghost.meta, inputs: ghost.inputs, chain: ghost.chain }));
  const runId = crypto.randomUUID();
  const flagged = flags.length ? 1 : 0;
  try {
    await env.DB.prepare("INSERT INTO racing_runs (id, user_id, created_at, challenge_date, track_id, car_id, physics_version, ticks, score, distance_m, top_kph, evidence_hash, evidence_bytes, flagged, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(runId, user.id, now, claim.challenge_date, claim.track_id, claim.car_id, Physics.VERSION, ghost.ticks,
        measured.score, Math.round(measured.distanceM), Math.round(measured.topKph), evidenceHash, text.length, flagged, JSON.stringify(flags)).run();
  } catch (e) {
    // The unique index on (user_id, evidence_hash) fired: this exact recording
    // has been submitted before, with a fresh nonce. Replaying one good lap for
    // every nonce you can get is the cheapest cheat there is.
    const prior = await env.DB.prepare("SELECT id, score FROM racing_runs WHERE user_id = ? AND evidence_hash = ?").bind(user.id, evidenceHash).first();
    if (prior) return { status: 409, body: { error: "That run was already submitted.", reason: "repeated identical evidence", runId: prior.id, score: prior.score } };
    throw e;
  }

  // The payout and the daily completion mark go through the ledger like
  // everything else, keyed by the run id, so a retried submission response
  // cannot pay twice.
  const payout = flagged ? 0 : Math.min(2000, Math.floor(measured.score / 10));
  const credit = await applyOperation(env, user, "run:" + runId, async (garage) => ({
    kind: "reward", itemId: runId, amount: payout,
    data: { ...garage.data, dailyDone: { ...garage.data.dailyDone, [claim.challenge_date]: runId } },
    result: { runId, payout }
  }));

  return {
    status: 200,
    body: {
      ok: true, runId, accepted: !flagged, withheld: !!flagged, flags,
      score: measured.score, distanceM: Math.round(measured.distanceM), topKph: Math.round(measured.topKph),
      seconds: Math.round(measured.seconds * 100) / 100,
      payout, cash: credit.body && credit.body.cash,
      challengeDate: claim.challenge_date, trackId: claim.track_id, carId: claim.car_id
    }
  };
}

// ---- leaderboard -----------------------------------------------------------
async function leaderboard(env, url) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") || "") ? url.searchParams.get("date") : utcDate();
  const trackParam = url.searchParams.get("track");
  const trackId = TRACK_IDS.includes(trackParam) ? trackParam : dailyChallenge(date).trackId;
  const limit = clampInt(url.searchParams.get("limit") || 25, 1, 100);
  // flagged = 0 only: a withheld run is never displayed, to its author or to
  // anyone else. Best run per account, and the public name is the handle.
  const rows = await env.DB.prepare(
    "SELECT r.score AS score, r.ticks AS ticks, r.created_at AS createdAt, g.handle AS handle" +
    " FROM racing_runs r LEFT JOIN racing_garage g ON g.user_id = r.user_id" +
    " WHERE r.challenge_date = ? AND r.track_id = ? AND r.flagged = 0 AND r.physics_version = ?" +
    " AND r.score = (SELECT MAX(s.score) FROM racing_runs s WHERE s.user_id = r.user_id AND s.challenge_date = r.challenge_date AND s.track_id = r.track_id AND s.flagged = 0)" +
    " GROUP BY r.user_id ORDER BY score DESC, createdAt ASC LIMIT ?"
  ).bind(date, trackId, Physics.VERSION, limit).all();
  return {
    status: 200,
    body: {
      date, trackId, physicsVersion: Physics.VERSION,
      entries: (rows.results || []).map((row, i) => ({
        rank: i + 1,
        // Never the email. An account without a handle yet shows as a racer
        // number rather than leaking anything.
        handle: row.handle || "Racer",
        score: row.score,
        seconds: Math.round((row.ticks * FixedStep.STEP) * 100) / 100
      }))
    }
  };
}

// ---- preferences -----------------------------------------------------------
/* Last-writer-by-field. Ties resolve by comparing device ids, not by which
   request happened to arrive first, so two devices that write at the same
   millisecond converge on the same answer wherever they are read. */
async function putPrefs(env, user, body) {
  const incoming = body.prefs && typeof body.prefs === "object" ? body.prefs : null;
  if (!incoming) return { status: 400, body: { error: "Bad request." } };
  const deviceId = String(body.deviceId || "").slice(0, 64);
  for (let attempt = 0; attempt < 6; attempt++) {
    const garage = await ensureGarage(env, user);
    const prefs = { ...garage.data.prefs };
    let changed = 0;
    Object.keys(incoming).slice(0, 80).forEach((key) => {
      if (!/^[A-Za-z0-9_.-]{1,48}$/.test(key)) return;
      const p = incoming[key];
      if (!p || typeof p !== "object") return;
      const at = Math.round(Number(p.changedAt));
      if (!Number.isFinite(at)) return;
      const size = JSON.stringify(p.value == null ? null : p.value);
      if (size == null || size.length > 400) return;
      const dev = String(p.deviceId || deviceId || "").slice(0, 64);
      const old = prefs[key];
      const wins = !old || at > old.changedAt || (at === old.changedAt && dev > String(old.deviceId || ""));
      if (wins) { prefs[key] = { value: p.value, changedAt: at, deviceId: dev }; changed++; }
    });
    const data = { ...garage.data, prefs };
    const r = await env.DB.prepare("UPDATE racing_garage SET data = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?")
      .bind(JSON.stringify(normalizeGarageData(data)), Date.now(), user.id, garage.revision).run();
    // Preferences do not touch the balance, so they bump the revision but take
    // no ledger row. A stale client is told the current revision and reapplies
    // its own unsent field edits -- never its old economy state.
    if (r.meta.changes) return { status: 200, body: { ok: true, revision: garage.revision + 1, changed, prefs } };
  }
  return { status: 409, body: { error: "The garage is being updated on another device. Try again." } };
}

// ---- routing ---------------------------------------------------------------
/* Called from worker/index.js for every authenticated `racing/*` path. Returns a
   { status, body } pair, or null if the path is not ours. */
export async function routeRacing(req, env, path, user) {
  const url = new URL(req.url);
  if (path === "racing/leaderboard" && req.method === "GET") return leaderboard(env, url);
  if (path === "racing/daily" && req.method === "GET") {
    return { status: 200, body: { challenge: dailyChallenge(url.searchParams.get("date")), serverDate: utcDate() } };
  }
  if (path === "racing/garage" && req.method === "GET") {
    const garage = await ensureGarage(env, user);
    return { status: 200, body: { garage: garageView(garage), serverDate: utcDate() } };
  }
  if (path === "racing/nonce" && req.method === "POST") return issueNonce(env, user, await readJson(req));
  if (path === "racing/submit" && req.method === "POST") return submitRun(env, user, await req.text());

  // Everything below moves money, so it is rate limited as one bucket.
  if ((path === "racing/purchase" || path === "racing/convert" || path === "racing/migrate" || path === "racing/prefs") && req.method === "POST") {
    const limited = await rateLimited(env, user.id, "economy");
    if (limited) return { status: 429, body: { error: "Too many garage changes. Wait a moment.", retryAfter: limited.retryAfter } };
    const body = await readJson(req);
    if (path === "racing/purchase") return purchase(env, user, body);
    if (path === "racing/convert") return convertTokens(env, user, body);
    if (path === "racing/prefs") return putPrefs(env, user, body);
    const opId = validOpId(body.opId);
    if (!opId) return { status: 400, body: { error: "A migration needs an operation id." } };
    return importLegacy(env, user, opId);
  }
  return null;
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 64 * 1024) return {};
  return safeJson(text, {});
}

/* Overlay for the legacy `/api/progress` merge.
 *
 * Once an account has a server-side garage with the legacy import done, the
 * economy fields in the progress blob are a cache. They are echoed back so an
 * old client still renders, but a save can no longer move them: `cash` comes
 * from the ledger balance and the owned lists come from ledger-validated
 * unlocks, whatever the request body said. Returns null for accounts that have
 * not migrated, so the v3 merge is untouched. */
export async function serverOwnedGarage(env, userId) {
  const row = await env.DB.prepare("SELECT cash, revision, data, legacy_imported FROM racing_garage WHERE user_id = ?").bind(userId).first();
  if (!row || !row.legacy_imported) return null;
  const data = normalizeGarageData(safeJson(row.data, {}));
  return { cash: Number(row.cash) || 0, revision: Number(row.revision) || 0, cars: data.cars, kits: data.kits, wings: data.wings, tracks: data.tracks };
}

// Exported for the unit tests, which exercise the pure parts without a Worker.
export const _internal = { normalizeGarageData, tuneProblem, scoreReplay, itemPrice, validOpId, handleFrom, dailyChallenge, TUNE_MIN, TUNE_MAX, MAX_EVIDENCE_BYTES };
