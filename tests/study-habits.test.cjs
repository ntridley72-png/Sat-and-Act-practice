/* Spaced-repetition scheduling, mastery levels and day keys (pure logic, no browser). */
const assert = require("node:assert/strict");
const H = require("../study-habits.js");
const { DAY, applyResult, dueIds, counts, mastery, INTERVAL_DAYS } = H;
const T = Date.UTC(2026, 10, 20, 12);

// A question answered right the first time never enters the queue.
assert.equal(applyResult(undefined, true, T), null);
// A miss enters box 1, due tomorrow.
let e = applyResult(undefined, false, T);
assert.deepEqual({ box: e.box, due: e.due, lapses: e.lapses }, { box: 1, due: T + DAY, lapses: 1 });
// Seeing it before it is due, and answering right, does not advance it (no skipping the schedule).
assert.equal(applyResult(e, true, T + DAY / 2), e);
// Right when due: box 2, due in 3 days; then 7, 14, 30 days.
const expect = [[2, 3], [3, 7], [4, 14], [5, 30]];
let now = T + DAY;
for (const [box, days] of expect) {
  e = applyResult(e, true, now);
  assert.equal(e.box, box); assert.equal(e.due, now + days * DAY);
  now = e.due;
}
// Right again in box 5 graduates it out of the queue.
assert.equal(applyResult(e, true, now), null);
// A miss at any box sends it back to box 1 and counts a lapse.
const high = { box: 4, due: T, lapses: 1, last: T };
const back = applyResult(high, false, T + 5);
assert.equal(back.box, 1); assert.equal(back.lapses, 2); assert.equal(back.due, T + 5 + DAY);
assert.deepEqual(INTERVAL_DAYS, [0, 1, 3, 7, 14, 30]);

// Due list: most overdue first, limited, ignores entries not yet due.
const srs = { a: { box: 1, due: T - 3 * DAY }, b: { box: 2, due: T - 1 * DAY }, c: { box: 1, due: T + DAY }, d: { box: 1, due: T - 5 * DAY } };
assert.deepEqual(dueIds(srs, T), ["d", "a", "b"]);
assert.deepEqual(dueIds(srs, T, 2), ["d", "a"]);
const c = counts(srs, T);
assert.deepEqual({ total: c.total, due: c.due, scheduled: c.scheduled, nextDue: c.nextDue }, { total: 4, due: 3, scheduled: 1, nextDue: T + DAY });
assert.deepEqual(counts({}, T), { total: 0, due: 0, scheduled: 0, nextDue: null });

// Mastery: small samples cannot reach the top levels.
assert.equal(mastery(0, 0).key, "none");
assert.equal(mastery(1, 0).key, "attempted");
assert.equal(mastery(4, 0).key, "attempted");      // 100% over 4 is still only a start
assert.equal(mastery(5, 0).key, "familiar");
assert.equal(mastery(3, 2).key, "familiar");       // 60% over 5
assert.equal(mastery(2, 3).key, "attempted");      // 40% over 5
assert.equal(mastery(8, 2).key, "proficient");     // 80% over 10
assert.equal(mastery(7, 3).key, "familiar");       // 70% over 10
assert.equal(mastery(18, 2).key, "mastered");      // 90% over 20
assert.equal(mastery(17, 3).key, "proficient");    // 85% over 20
assert.equal(mastery(9, 1).key, "proficient");     // 90% over 10 is proficient, not mastered
assert.equal(mastery(19, 1).key, "mastered");      // 95% over 20
assert.equal(mastery(8, 2).accuracy, 80);
assert.equal(H.dayKey(new Date(2026, 0, 5, 23, 30).getTime()), "2026-01-05");

console.log("PASS: review queue schedule (1/3/7/14/30 days, no skipping, lapses, graduation), due ordering, and mastery levels behave.");
