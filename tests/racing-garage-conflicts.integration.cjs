/* Garage progress is long-lived account data. A stale device must not erase cars
   or parts unlocked elsewhere, nor roll earned cash backwards, while the winning
   edit still decides the currently selected car, paint, track and tune. */
const assert = require('node:assert/strict');

(async () => {
  const base = 'http://localhost:8787/api/';
  const email = 'garage-test-' + Date.now() + '@example.com', password = 'Local-test-only-9281';

  async function api(path, body, token) {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json(); assert(r.ok, JSON.stringify(j)); return j;
  }
  const session = await api('signup', { email, password });
  const put = async (garage, updatedAt) => {
    const r = await fetch(base + 'progress', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token }, body: JSON.stringify({ updatedAt, data: { profile: { garage }, history: [], state: { v: 4 } } }) });
    const j = await r.json(); assert(r.ok, JSON.stringify(j)); return j;
  };
  const read = async () => (await api('progress', null, session.token)).data.profile.garage;

  // Device A: newer edit. Unlocks the rally car, earns cash, picks teal.
  await put({ v: 3, cash: 4000, car: 'rally', raceCar: 'rally', unlocked: ['sport', 'rally'], ownedKits: ['stock', 'wide'], ownedWings: ['none', 'lip'], paint: 'teal', track: 'club', tune: { power: 1.2, grip: 1.1 } }, Date.now() + 10);
  // Device B: stale edit that never saw any of it, and is poorer.
  await put({ v: 3, cash: 250, car: 'sport', raceCar: 'sport', unlocked: ['sport', 'muscle'], ownedKits: ['stock'], ownedWings: ['none', 'lip', 'gt'], paint: 'blue', track: 'oval', tune: { power: 0.8 } }, 1);

  const g = await read();
  assert.deepEqual([...g.unlocked].sort(), ['muscle', 'rally', 'sport'], 'unlocked cars union across devices');
  assert.deepEqual([...g.ownedKits].sort(), ['stock', 'wide'], 'owned body kits union');
  assert.deepEqual([...g.ownedWings].sort(), ['gt', 'lip', 'none'], 'owned wings union');
  assert.equal(g.cash, 4000, 'cash keeps the higher balance, never the stale one');
  assert.equal(g.car, 'rally', 'the winning edit still chooses the selected car');
  assert.equal(g.paint, 'teal', 'the winning edit still chooses cosmetics');
  assert.equal(g.track, 'club', 'the winning edit still chooses the track');
  assert.equal(g.tune.power, 1.2, 'the winning tune value wins per field');
  assert.equal(g.tune.grip, 1.1, 'tune fields only the winner set are preserved');
  assert.equal(g.v, 3, 'schema version never regresses');

  // A device that has no garage at all must not wipe one that does.
  await put(undefined, Date.now() + 20);
  const after = await read();
  assert.deepEqual([...after.unlocked].sort(), ['muscle', 'rally', 'sport'], 'a garage-less save leaves unlocks intact');
  assert.equal(after.cash, 4000, 'a garage-less save leaves cash intact');

  // Oversized unlock ids are rejected rather than stored.
  await put({ unlocked: ['sport', 'x'.repeat(200)], cash: 4000 }, Date.now() + 30);
  const sanitized = await read();
  assert(!sanitized.unlocked.some((id) => id.length >= 80), 'implausible unlock ids are dropped');

  await api('logout', {}, session.token);
  console.log('PASS: garage unlock unions, cash floor, per-field preference wins, garage-less saves, and id sanitization.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
