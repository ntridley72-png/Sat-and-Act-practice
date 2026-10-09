/* Adversarial integration tests for the server-owned racing economy.
 *
 * These are the cases that broke under the old max(cash) merge: legitimately
 * spent money coming back, earnings duplicated across devices, and a stale tab
 * dictating a balance. Run against `npx wrangler dev --port 8787 --local`.
 */
const assert = require('node:assert/strict');

const BASE = 'http://localhost:8787/api/';
let ops = 0;
const opId = (tag) => 'op-' + Date.now().toString(36) + '-' + (ops++) + '-' + String(tag || 'x') + '-padpadpad';

(async () => {
  const session = await signup('racing-econ');
  const call = api(session.token);

  // ---- a fresh device sees a server garage, not a client one --------------
  let garage = (await call('GET', 'racing/garage')).body.garage;
  assert.equal(garage.schemaVersion, 4, 'the server serves garage schema v4');
  assert.equal(garage.cash, 0, 'a new account starts with no cash, whatever a client might claim');
  assert.deepEqual(garage.owned.cars, ['sport'], 'a new account owns only the starter car');
  assert.ok(garage.handle && !garage.handle.includes('@'), 'the account gets a generated handle, never the email');
  assert.ok(!JSON.stringify(garage).includes(session.email), 'the garage payload never contains the email address');
  assert.equal(garage.legacyImported, false, 'nothing has been imported yet');

  // ---- buying is impossible before there is money ------------------------
  let r = await call('POST', 'racing/purchase', { opId: opId('broke'), kind: 'car', itemId: 'hyper' });
  assert.equal(r.status, 409, 'buying a $9,000 car with $0 is refused');
  assert.match(r.body.error, /Not enough/, r.body.error);
  assert.equal((await call('GET', 'racing/garage')).body.garage.cash, 0, 'a refused purchase does not move the balance');
  assert.ok(!(await call('GET', 'racing/garage')).body.garage.owned.cars.includes('hyper'), 'a refused purchase grants nothing');

  // ---- prices are the server's, not the request's ------------------------
  r = await call('POST', 'racing/purchase', { opId: opId('free'), kind: 'car', itemId: 'hyper', price: 0 });
  assert.equal(r.status, 409, 'a client-supplied price of 0 is ignored; the server price still applies');
  r = await call('POST', 'racing/purchase', { opId: opId('fake'), kind: 'car', itemId: 'not-a-real-car' });
  assert.equal(r.status, 400, 'an item that is not in the catalogue cannot be bought');
  r = await call('POST', 'racing/purchase', { opId: opId('proto'), kind: 'kit', itemId: '__proto__' });
  assert.equal(r.status, 400, '__proto__ is not a body kit');
  r = await call('POST', 'racing/purchase', { opId: 'short', kind: 'car', itemId: 'hatch' });
  assert.equal(r.status, 400, 'a purchase without a usable operation id is refused');

  // ---- legacy v3 import: exactly once, from stored progress --------------
  // Seed a v3 garage the way an existing player's browser would have.
  await put(session.token, {
    updatedAt: Date.now(),
    data: { history: [], state: { v: 4 }, profile: { tokens: 6, garage: { v: 3, cash: 5000, unlocked: ['sport', 'gti', 'panda', 'rally'], ownedKits: ['stock', 'wide'], ownedWings: ['none', 'gt'] } } }
  });

  const migrateOp = opId('migrate');
  r = await call('POST', 'racing/migrate', { opId: migrateOp });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cash, 5000, 'legacy cash is credited once');
  assert.equal(r.body.imported.cash, 5000);

  // Replaying the same operation id is a no-op that returns the same answer.
  const replay = await call('POST', 'racing/migrate', { opId: migrateOp });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true, 'a replayed operation id is recognised as a replay');
  assert.equal(replay.body.cash, 5000, 'a replayed import does not credit the money twice');

  // A *fresh* operation id cannot import again either: the flag, not just the id.
  r = await call('POST', 'racing/migrate', { opId: opId('migrate2') });
  assert.equal(r.status, 409, 'a second import attempt with a new operation id is refused');
  assert.equal((await call('GET', 'racing/garage')).body.garage.cash, 5000, 'cash is still 5000 after the refused second import');

  garage = (await call('GET', 'racing/garage')).body.garage;
  // gti and panda both map onto the `hatch` launch car; the unlock is granted once.
  assert.deepEqual([...garage.owned.cars].sort(), ['hatch', 'rally', 'sport'], 'legacy ids map onto launch cars and duplicate mappings unlock once');
  assert.deepEqual([...garage.owned.kits].sort(), ['stock', 'wide'], 'legacy body kits carry over');
  assert.equal(garage.legacyImported, true);

  // ---- after migration the client's cash figure is never trusted again ---
  await put(session.token, {
    updatedAt: Date.now() + 5000,
    data: { history: [], state: { v: 4 }, profile: { garage: { v: 4, cash: 999999999, unlocked: ['sport', 'hyper', 'track', 'straight'], ownedKits: ['wide'], ownedWings: ['gt'] } } }
  });
  const echoed = (await get(session.token, 'progress')).data.profile.garage;
  assert.equal(echoed.cash, 5000, 'a progress save claiming $999,999,999 cannot move the ledger balance');
  assert.deepEqual([...echoed.unlocked].sort(), ['hatch', 'rally', 'sport'], 'a progress save cannot grant cars the ledger never sold');
  assert.equal((await call('GET', 'racing/garage')).body.garage.cash, 5000, 'the ledger balance is unchanged');

  // ---- $5,000 does not buy a $5,200 car, not even by $200 ----------------
  r = await call('POST', 'racing/purchase', { opId: opId('nearly'), kind: 'car', itemId: 'rotary' });
  assert.equal(r.status, 409, 'being $200 short is still short');
  assert.equal(r.body.needed, 5200, 'the refusal says what the item costs');
  assert.equal((await call('GET', 'racing/garage')).body.garage.cash, 5000, 'the near-miss left the balance alone');

  console.log('PASS (part 1): fresh garage, server-side prices, insufficient funds, one-time idempotent legacy import, untrusted client cash.');

  // ---- affordable purchase, replay, and two-device races -----------------
  // Top up through the token conversion, which is itself a ledger operation.
  const convertOp = opId('convert');
  r = await call('POST', 'racing/convert', { opId: convertOp, tokens: 6 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cash, 5000 + 6 * 250, 'six tokens convert to $1,500');
  assert.equal(r.body.converted.tokensLeft, 0, 'the tokens are spent');

  const convertReplay = await call('POST', 'racing/convert', { opId: convertOp, tokens: 6 });
  assert.equal(convertReplay.body.replayed, true, 'a replayed conversion is a no-op');
  assert.equal(convertReplay.body.cash, 6500, 'a replayed conversion does not pay twice');

  // The tokens are gone, so a brand-new conversion cannot manufacture cash.
  r = await call('POST', 'racing/convert', { opId: opId('convert2'), tokens: 6 });
  assert.equal(r.status, 409, 'converting tokens the account no longer has is refused');
  assert.match(r.body.error, /practice tokens/);

  let cash = (await call('GET', 'racing/garage')).body.garage.cash;
  assert.equal(cash, 6500, 'balance after the honest conversion');

  // Buy the $5,200 rotary: affordable now.
  const rotaryOp = opId('rotary');
  r = await call('POST', 'racing/purchase', { opId: rotaryOp, kind: 'car', itemId: 'rotary' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.purchased.price, 5200);
  assert.equal(r.body.cash, 1300, 'the balance drops by exactly the catalogue price');

  // Replaying the purchase operation id neither charges again nor refunds.
  const rotaryReplay = await call('POST', 'racing/purchase', { opId: rotaryOp, kind: 'car', itemId: 'rotary' });
  assert.equal(rotaryReplay.body.replayed, true, 'a replayed purchase is recognised');
  assert.equal(rotaryReplay.body.cash, 1300, 'a replayed purchase does not charge twice');

  // ---- two devices, same item, at the same moment ------------------------
  // The classic double-spend: one debit, and the loser is told it already owns
  // the car rather than being charged for it a second time.
  await put(session.token, { updatedAt: Date.now() + 9000, data: { history: [], state: { v: 4 }, profile: { tokens: 20 } } });
  await call('POST', 'racing/convert', { opId: opId('topup2'), tokens: 20 });
  cash = (await call('GET', 'racing/garage')).body.garage.cash;
  assert.equal(cash, 1300 + 5000, 'topped up to $6,300');

  const [a, b] = await Promise.all([
    call('POST', 'racing/purchase', { opId: opId('race-a'), kind: 'car', itemId: 'track' }),   // $6,200
    call('POST', 'racing/purchase', { opId: opId('race-b'), kind: 'car', itemId: 'track' })
  ]);
  const paid = [a, b].filter((x) => x.status === 200 && x.body.purchased);
  const noop = [a, b].filter((x) => x.status === 200 && x.body.alreadyOwned);
  assert.equal(paid.length, 1, 'exactly one of two concurrent purchases of the same car pays: ' + JSON.stringify([a.body, b.body]));
  assert.equal(noop.length, 1, 'the other is a benign already-owned, not a second charge');
  cash = (await call('GET', 'racing/garage')).body.garage.cash;
  assert.equal(cash, 6300 - 6200, 'the car was paid for exactly once');
  assert.ok((await call('GET', 'racing/garage')).body.garage.owned.cars.includes('track'), 'and the car is owned');

  // ---- two devices, different items: money is neither lost nor duplicated -
  await put(session.token, { updatedAt: Date.now() + 12000, data: { history: [], state: { v: 4 }, profile: { tokens: 8 } } });
  await call('POST', 'racing/convert', { opId: opId('topup3'), tokens: 8 });
  const before = (await call('GET', 'racing/garage')).body.garage.cash;
  assert.equal(before, 100 + 2000, 'balance before the concurrent pair');

  // Neither item is owned yet: `wide` and `gt` arrived with the legacy import,
  // and buying an owned item is a no-op rather than a debit (asserted below).
  const [k, w] = await Promise.all([
    call('POST', 'racing/purchase', { opId: opId('kit'), kind: 'kit', itemId: 'street' }),  // $400
    call('POST', 'racing/purchase', { opId: opId('wing'), kind: 'wing', itemId: 'duck' })   // $300
  ]);
  assert.equal(k.status, 200, JSON.stringify(k.body));
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.ok(k.body.purchased && w.body.purchased, 'both were real purchases, not already-owned no-ops');
  const after = (await call('GET', 'racing/garage')).body.garage.cash;
  assert.equal(after, before - 400 - 300, 'two concurrent purchases of different items both apply: no lost update, no duplicated spend');
  garage = (await call('GET', 'racing/garage')).body.garage;
  assert.ok(garage.owned.kits.includes('street') && garage.owned.wings.includes('duck'), 'both items are owned');

  // ---- an already-owned item costs nothing -------------------------------
  // `gt` came in with the legacy import, so re-buying it must not charge again.
  const owned = await call('POST', 'racing/purchase', { opId: opId('owned'), kind: 'wing', itemId: 'gt' });
  assert.equal(owned.status, 200, JSON.stringify(owned.body));
  assert.equal(owned.body.alreadyOwned, true, 'buying an item the ledger already granted is a no-op');
  assert.equal(owned.body.cash, after, 'and it does not move the balance');

  console.log('PASS (part 2): token conversion, replayed purchases, concurrent same-item double-spend, concurrent different-item purchases with no lost or duplicated currency.');

  // ---- preferences: last writer by field, ties by device id --------------
  r = await call('POST', 'racing/prefs', { deviceId: 'phone', prefs: { paint: { value: 'teal', changedAt: 100 }, cam: { value: 'chase', changedAt: 100 } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // A later edit to one field wins that field and leaves the other alone.
  r = await call('POST', 'racing/prefs', { deviceId: 'laptop', prefs: { paint: { value: 'blue', changedAt: 200 } } });
  assert.equal(r.body.prefs.paint.value, 'blue', 'the later edit wins its own field');
  assert.equal(r.body.prefs.cam.value, 'chase', 'a field nobody touched is preserved');
  // An older edit loses, even arriving later: offline queues reconcile by time.
  r = await call('POST', 'racing/prefs', { deviceId: 'phone', prefs: { paint: { value: 'red', changedAt: 150 } } });
  assert.equal(r.body.prefs.paint.value, 'blue', 'an older offline edit arriving late does not win');
  // A tie resolves by device id, not by arrival order, so every device agrees.
  r = await call('POST', 'racing/prefs', { deviceId: 'zzz-device', prefs: { paint: { value: 'green', changedAt: 200 } } });
  assert.equal(r.body.prefs.paint.value, 'green', 'a same-millisecond tie resolves by the higher device id');
  r = await call('POST', 'racing/prefs', { deviceId: 'aaa-device', prefs: { paint: { value: 'black', changedAt: 200 } } });
  assert.equal(r.body.prefs.paint.value, 'green', 'and the lower device id loses the same tie, whichever arrives first');

  // Preferences cannot carry economy state.
  r = await call('POST', 'racing/prefs', { deviceId: 'phone', prefs: { cash: { value: 999999, changedAt: 999 } } });
  assert.equal((await call('GET', 'racing/garage')).body.garage.cash, after, 'a preference named "cash" does not change the balance');

  // ---- stale client ------------------------------------------------------
  // Every economy write reports the current revision, which is what a stale
  // client needs in order to reapply its own unsent preference edits only.
  const rev = (await call('GET', 'racing/garage')).body.garage.revision;
  assert.ok(rev > 0, 'the garage carries a revision');
  r = await call('POST', 'racing/purchase', { opId: opId('rev'), kind: 'wing', itemId: 'lip' });
  assert.equal(r.body.revision, rev + 1, 'an economy write advances the revision so a stale client can detect it');

  // ---- rate limiting -----------------------------------------------------
  // 120 economy calls per 10 minutes. Fire past it and check the limiter bites
  // and reports a retry delay rather than silently dropping requests.
  let limited = null;
  for (let i = 0; i < 140 && !limited; i++) {
    const res = await call('POST', 'racing/purchase', { opId: opId('flood' + i), kind: 'wing', itemId: 'lip' });
    if (res.status === 429) limited = res;
  }
  assert.ok(limited, 'the economy endpoints are rate limited');
  assert.ok(limited.body.retryAfter > 0, 'a rate-limited caller is told when to come back');

  await call('POST', 'logout', {});
  console.log('PASS (part 3): last-writer-by-field preferences with device-id tie-breaking, revision reporting for stale clients, and economy rate limiting.');
  console.log('PASS: racing economy integration.');
})().catch((e) => { console.error(e); process.exitCode = 1; });

// ---- helpers ---------------------------------------------------------------
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
async function put(token, payload) {
  const r = await fetch(BASE + 'progress', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) });
  const j = await r.json();
  assert.ok(r.ok, 'progress save failed: ' + JSON.stringify(j));
  return j;
}
async function get(token, path) {
  const r = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token } });
  return r.json();
}
