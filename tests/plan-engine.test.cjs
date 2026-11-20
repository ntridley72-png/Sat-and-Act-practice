/* Unit tests for the score-report parser and the study-plan engine (pure modules, no browser). */
const assert = require("node:assert/strict");
const R = require("../score-report.js");
const P = require("../study-plan.js");

// ---------- report parser ----------
const sat = R.parseReportText(`College Board
SAT Score Report
Test Date: March 8, 2025
Your Total Score 1290
Score Range 1250 - 1330
Reading and Writing 650 Math 640
Section Score Range 610-690
Information and Ideas 5 of 7
Craft and Structure 4/7
Expression of Ideas 6 of 7
Standard English Conventions 3 of 7
Algebra 6 of 7
Advanced Math 2 of 7
Problem-Solving and Data Analysis 5 of 7
Geometry and Trigonometry 4 of 7`);
assert.equal(sat.kind, "sat");
assert.equal(sat.date, "2025-03-08");
assert.equal(sat.total, 1290);
assert.deepEqual(sat.sections, { rw: 650, math: 640 });
assert.equal(sat.domains["Advanced Math"], 2);
assert.equal(sat.domains["Information & Ideas"], 5);
assert.equal(Object.keys(sat.domains).length, 8);
assert.deepEqual(sat.warnings, []);

// A score range must not be mistaken for the score, and section scores must agree with the total.
const noisy = R.parseReportText("SAT Total Score 1010 Range 970-1050 Reading and Writing 500 Math 510");
assert.equal(noisy.total, 1010);
assert.deepEqual(noisy.sections, { rw: 500, math: 510 });

// Total derived from sections is flagged; a missing section is derived from the total.
const derived = R.parseReportText("SAT College Board Reading and Writing 710 Math 690");
assert.equal(derived.total, 1400);
assert.ok(derived.warnings.some((w) => /added up/.test(w)));

// Values that fail the range checks are never returned.
const bad = R.parseReportText("SAT Total Score 1255 Reading and Writing 650 Math 99");
assert.notEqual(bad.total, 1255);
assert.ok(bad.sections.math == null || bad.sections.math !== 99);

const act = R.parseReportText("ACT Score Report Test date 10/26/2024 Composite Score 27 English 29 Mathematics 24 Reading 28 Science 26 STEM 25");
assert.equal(act.kind, "act");
assert.equal(act.date, "2024-10-26");
assert.equal(act.total, 27);
assert.deepEqual(act.sections, { english: 29, math: 24, reading: 28, science: 26 });

const none = R.parseReportText("Dear student, here is your invoice for 2024.");
assert.equal(none.found, false);
assert.equal(R.parseReportText("").found, false);

assert.equal(R.parseDate("Test Date: Sept 14, 2024"), "2024-09-14");
assert.equal(R.parseDate("taken 2024-05-04"), "2024-05-04");
assert.equal(R.parseDate("June 2025"), "2025-06-01");
assert.equal(R.parseDate("13/45/2024"), null);

// ---------- plan engine ----------
const sk = (key, section, domain, skill, r, w, pool = 30) => ({ key, test: "sat", section, domain, skill, pool, r, w });
const skills = [
  sk("a1", "math", "Algebra", "Linear equations in one variable", 2, 8),
  sk("a2", "math", "Algebra", "Systems of two linear equations", 9, 1),
  sk("a3", "math", "Advanced Math", "Quadratic equations", 0, 0),
  sk("a4", "rw", "Standard English Conventions", "Boundaries", 5, 5),
  sk("a5", "rw", "Craft & Structure", "Words in Context", 0, 0),
  sk("a6", "rw", "Information & Ideas", "Inferences", 0, 0),
];
const base = { today: "2026-11-20", test: "sat", goal: { total: 1400, date: "2027-01-15" }, minutesPerWeek: 180, skills,
  reports: [{ kind: "sat", date: "2026-10-04", total: 1250, sections: { rw: 640, math: 610 }, domains: { "Algebra": 3, "Advanced Math": 2, "Craft & Structure": 6, "Standard English Conventions": 4, "Information & Ideas": 5 } }],
  practice: { sat: { total: 1230, rw: 620, math: 610 } } };

let plan = P.buildPlan(base);
assert.equal(plan.summary.gap, 150);
assert.equal(plan.summary.weeks, 8);
assert.equal(plan.summary.baseline.source, "official");
assert.equal(plan.focus[0].skill, "Quadratic equations", "the weakest domain on the report leads");
assert.ok(!plan.focus.some((f) => f.skill === "Systems of two linear equations"), "a skill answered 90% right is not a focus");
assert.ok(plan.focus[0].signals[0].startsWith("Report: Advanced Math 2/7"));
assert.equal(plan.schedule.length, 8);
plan.schedule.forEach((w) => {
  assert.ok(w.items.some((i) => i.type === "drill"), "every week has drills");
  assert.ok(w.items.some((i) => i.type === "review"), "every week has a review block");
  assert.equal(w.items[0].key, plan.focus[0].key, "the top focus returns every week");
});

// Same inputs, same plan.
assert.deepEqual(P.buildPlan(base), plan);

// More study time means more drills, bounded 60 to 600 minutes.
const drills = (p) => p.schedule[0].items.filter((i) => i.type === "drill").length;
assert.ok(drills(P.buildPlan({ ...base, minutesPerWeek: 360 })) > drills(P.buildPlan({ ...base, minutesPerWeek: 90 })));
assert.equal(P.buildPlan({ ...base, minutesPerWeek: 5 }).summary.minutesPerWeek, 60);
assert.equal(P.buildPlan({ ...base, minutesPerWeek: 99999 }).summary.minutesPerWeek, 600);

// Past test date: four-week plan with a note. No goal: no gap, no crash.
plan = P.buildPlan({ ...base, goal: { total: 1400, date: "2026-01-01" } });
assert.equal(plan.summary.weeks, 4);
assert.ok(plan.notes.some((n) => /passed/.test(n)));
plan = P.buildPlan({ ...base, goal: null });
assert.equal(plan.summary.gap, null);

// Already at the goal.
plan = P.buildPlan({ ...base, goal: { total: 1200, date: "" } });
assert.ok(plan.summary.gap < 0 && plan.notes.some((n) => /already at your goal/.test(n)));

// No data at all: still a plan, and it says so.
plan = P.buildPlan({ today: "2026-11-20", test: "sat", goal: { total: 1300 }, minutesPerWeek: 180, reports: [], practice: {}, skills: skills.map((s) => ({ ...s, r: 0, w: 0 })) });
assert.ok(plan.focus.length >= 3);
assert.ok(plan.notes.length >= 1);
assert.ok(plan.focus.every((f) => /Not measured yet/.test(f.signals[0])));

// The weaker section gets more weight when the section scores are lopsided.
const lop = P.buildPlan({ ...base, reports: [{ kind: "sat", date: "2026-10-04", total: 1150, sections: { rw: 700, math: 450 }, domains: {} }],
  skills: skills.map((s) => ({ ...s, r: 0, w: 0 })) });
assert.equal(lop.focus[0].section, "math");

// ACT works from section scores and skill accuracy only.
const actPlan = P.buildPlan({ today: "2026-11-20", test: "act", goal: { total: 30 }, minutesPerWeek: 120, reports: [{ kind: "act", date: "2026-10-26", total: 27, sections: { english: 29, math: 24, reading: 28, science: 26 }, domains: {} }],
  practice: {}, skills: [{ key: "x1", test: "act", section: "math", domain: "Math", skill: "Algebra", pool: 20, r: 1, w: 7 }, { key: "x2", test: "act", section: "english", domain: "English", skill: "Punctuation", pool: 20, r: 7, w: 1 }] });
assert.equal(actPlan.summary.gap, 3);
assert.equal(actPlan.focus[0].skill, "Algebra");

// The coach prompt carries numbers only, and tells the model not to invent any.
const msgs = P.coachMessages(P.buildPlan(base));
assert.equal(msgs[0].role, "system");
assert.match(msgs[0].content, /Use ONLY the facts/);
assert.match(msgs[1].content, /Goal: 1400/);
assert.ok(!/@|password|name:/i.test(msgs[1].content));

console.log("PASS: report parser and study-plan engine behave (ranges, consistency, ranking, weeks, bounds, determinism, coach prompt).");
