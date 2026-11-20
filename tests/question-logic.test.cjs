/* The question bank's answer keys are right, and stay right.
 *
 * Runs scripts/verify-question-logic.cjs over every live (non-withheld) question: independent solvers for
 * the templated math and science, rule checks for the templated Reading & Writing families, and blind
 * hand-solved tables for every hand-written question. This fails if
 *   - any keyed answer disagrees with the independent solution,
 *   - a question has two defensible answers, equal-valued choices, or an answer leak,
 *   - wording is broken (template leaks, "1 copies", non-word distractors),
 *   - eight or more questions in a row share the same keyed position,
 *   - or any live question is not covered by a check (so a new question cannot slip in unverified).
 * Add a new question and this test tells you what to add: a solver rule, or a line in
 * scripts/data/*-hand-solved.json (solve it from the stem alone, then compare).
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { run } = require("../scripts/verify-question-logic.cjs");

const rep = run(path.join(__dirname, ".."));
const fails = rep.findings.filter((f) => f.level === "fail");
const warns = rep.findings.filter((f) => f.level === "warn");
const show = (list) => list.slice(0, 25).map((f) => `  ${f.id} [${f.rule}] ${f.msg}`).join("\n");

assert.equal(fails.length, 0, `${fails.length} question(s) failed the logic audit:\n${show(fails)}`);
assert.equal(warns.length, 0, `${warns.length} audit warning(s):\n${show(warns)}`);

let live = 0;
for (const [set, c] of Object.entries(rep.coverage)) {
  live += c.total;
  assert.equal(c.unverified.length, 0, `${set}: ${c.unverified.length} live question(s) have no independent check, e.g. ${c.unverified.slice(0, 8).join(", ")}. Add a solver rule or a hand-solved entry.`);
}
assert.ok(live >= 2100, `only ${live} live questions were audited; the bank should hold at least 2,100`);

// Keyed positions stay spread out (no one letter dominates a section).
for (const [set, b] of Object.entries(rep.bias)) {
  if (b.n < 100) continue;
  const share = Math.max(...Object.values(b.position)) / b.n;
  assert.ok(share < 0.4, `${set}: one answer position holds ${(share * 100).toFixed(0)}% of keys`);
}

// The keyed answer is not the longest choice noticeably more often than chance (about 25%).
for (const [set, b] of Object.entries(rep.bias)) {
  if (b.n < 30) continue;
  assert.ok(b.longestIsKey < 0.35, `${set}: the keyed answer is the longest choice in ${(b.longestIsKey * 100).toFixed(0)}% of questions (chance is about 25%)`);
}

console.log(`PASS: all ${live} live questions are covered by an independent check; no wrong keys, ambiguous items, leaks, wording defects or answer-position runs.`);
