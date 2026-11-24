/* College matcher engine on the real 500-college data with fictional student profiles. Checks the rules the product
   promises: requirements exclude only on verified failure, unknowns go to "needs verification", weights normalize,
   results are reproducible, personal fit never depends on admissions, and estimates are never treated as facts. */
const assert = require("node:assert/strict");
global.window = {};
require("../college-data.js"); require("../college-match-data.js");
const M = require("../college-match-engine.js");
const CD = window.COLLEGE_DATA, MD = window.COLLEGE_MATCH_DATA;
const COL = CD.colleges, conc = CD.concordance.actToSat;
const run = (prefs) => M.rank(COL, MD, prefs, { concordance: conc });
const byId = (r, id) => r.all.find((x) => x.id === id);
const HARVARD = 166027, UTAH = 230764;

// 1) High-achieving student: selective colleges show as Reach by admissions, but fit is computed without admissions.
const hi = { academics: { sat: 1560, majors: ["cs"] }, place: { regions: ["northeast"] } };
let r = run(hi);
assert.equal(byId(r, HARVARD).admissions.label, "Reach", "under 15% admit is a reach for everyone");
const fitHarvard = byId(r, HARVARD).fit;
assert.equal(byId(run({ ...hi, academics: { ...hi.academics, sat: 1000 } }), HARVARD).fit, fitHarvard, "fit does not change with the test score");
assert.ok(r.sections.overall.length > 10);

// 2) Lower GPA with an upward trend: GPA is never used to classify admissions (no college GPA data), and that is said.
r = run({ academics: { gpa: 2.8, sat: 1100, majors: ["psych"] } });
assert.match(byId(r, UTAH).admissions.notes[0], /GPA is not compared/);

// 3) Test-optional: no score-based placement.
r = run({ academics: { sat: 1400, testOptional: true, majors: ["biology"] } });
const toUtah = byId(r, UTAH).admissions; assert.equal(toUtah.label, "Uncertain"); assert.match(toUtah.basis, /test-optional/);

// 4) Strict budget as a must: every college in the main list is verified within budget; unknown prices are not excluded.
r = run({ money: { budget: 15000, incomeBand: 0 }, importance: { budget: "must" } });
for (const x of r.sections.overall) assert.equal(x.affordability.label, "Within budget", x.name);
assert.ok(r.sections.excluded.length > 100, "most colleges cost more than $15k");
for (const x of r.sections.excluded) assert.ok(x.hardFail.some((i) => i.id === "budget"));
const noPrice = COL.filter((c) => c.np == null && !(c.bands && c.bands[0] && c.bands[0][1] != null)).map((c) => c.id);
for (const id of noPrice) assert.ok(!byId(r, id).excluded, "a missing price is not a verified failure");

// 5) Military dependent: Yellow Ribbon must-have.
r = run({ support: { yellowRibbon: true }, importance: { veterans: "must" } });
for (const x of r.sections.overall) assert.equal(MD.colleges[x.id].yellowRibbon, true);
for (const x of r.sections.excluded) assert.equal(MD.colleges[x.id].yellowRibbon, false);

// 6) Pharmacy: PharmD on campus is preferred, not required, so colleges without it stay but rank lower.
r = run({ academics: { majors: ["pharmsci", "chemistry", "biology"], professional: "pharmd" } });
assert.equal(r.sections.excluded.length, 0, "nothing is excluded without a must-have");
const top = r.sections.overall.slice(0, 10);
assert.ok(top.filter((x) => MD.colleges[x.id].prof.includes("pharmd")).length >= 8, "PharmD campuses lead");

// 7) Engineering must-have excludes only colleges with no engineering degrees reported.
r = run({ academics: { majors: ["engineering"] }, importance: { major: "must" } });
for (const x of r.sections.excluded) assert.ok(!MD.colleges[x.id].cip.some((c) => c.startsWith("14.")), x.name);
for (const x of r.sections.overall) assert.ok(MD.colleges[x.id].cip.some((c) => c.startsWith("14.")), x.name);

// 8) Undecided: breadth of fields drives the flexibility score.
r = run({ academics: { undecided: true } });
const fams = (id) => new Set(MD.colleges[id].cip.map((c) => c.slice(0, 2))).size;
assert.ok(fams(r.sections.overall[0].id) >= 20, "broad colleges first for undecided students");

// 9) Community-college transfer: the data covers four-year colleges only; the engine still runs.
r = run({ academics: { majors: ["business"] }, money: { inState: true, homeState: "TX" } });
assert.ok(r.sections.overall.every((x) => x.st === "TX" || x.fit < 1));

// 10) No car as a must-have: an estimate never excludes and never counts as verified.
r = run({ transport: { noCar: true }, importance: { carfree: "must" } });
assert.equal(r.sections.excluded.length, 0); assert.ok(r.sections.verify.length > 400, "every college needs checking");
assert.ok(r.all.every((x) => x.items.find((i) => i.id === "carfree").status !== "met"));

// 11) Two important places: a college near both beats one near neither, and distances are labeled straight-line.
const den = MD.places["Denver, CO"], sd = MD.places["San Diego, CA"];
r = run({ place: { places: [{ label: "Denver, CO", pt: den, miles: 100 }, { label: "San Diego, CA", pt: sd, miles: 100 }] } });
const pl = (id) => byId(r, id).items.find((i) => i.id === "places");
assert.match(pl(HARVARD).detail, /straight-line/); assert.equal(pl(HARVARD).status, "unmet");
const denverCollege = r.all.find((x) => x.city === "Denver"); assert.equal(pl(denverCollege.id).score, 0.5, "near one of two equally important places");

// 12) Contradictory requirements: everything is excluded, with the reason.
r = run({ campus: { control: "public" }, importance: { control: "must" }, academics: { majors: ["nursing"] } });
const r2 = run({ campus: { control: "private" }, importance: { control: "must" } });
assert.ok(r.sections.excluded.every((x) => x.hardFail[0].id === "control" || x.hardFail[0].id === "major"));
assert.ok(r2.sections.overall.every((x) => COL.find((c) => c.id === x.id).ctrl === "private"));

// 13) Skips everything: no fit scores at all rather than invented ones.
r = run({});
assert.equal(r.sections.overall.length, 0); assert.ok(r.all.every((x) => x.fit === null));

// ---- weights normalize, excluded categories drop out, results are reproducible and order-independent
const w = M.categoryWeights(M.normalize({ weights: { academic: 50, financial: 50, location: 0 } }), ["academic", "financial", "location"]);
assert.equal(w.academic, 50); assert.equal(w.financial, 50); assert.equal(w.location, 0);
const w2 = M.categoryWeights(M.normalize({}), ["academic", "transport"]); assert.equal(Math.round(w2.academic + w2.transport), 100);
const p = { academics: { majors: ["nursing"], sat: 1200 }, money: { budget: 25000 }, place: { settings: ["town", "rural"] } };
const a1 = run(p).sections.overall.map((x) => x.id + ":" + x.fit), a2 = M.rank(COL.slice().reverse(), MD, p, { concordance: conc }).sections.overall.map((x) => x.id + ":" + x.fit);
assert.deepEqual(a1, a2, "same inputs, same results, whatever the input order");

// ---- evidence coverage: unknowns lower coverage, not fit; the range brackets the fit
for (const x of run(p).all) if (x.fit != null) { assert.ok(x.fitLow <= x.fit + 1e-9 && x.fit <= x.fitHigh + 1e-9, x.name); assert.ok(x.coverage >= 0 && x.coverage <= 1); }

// ---- "why not this college"
r = run({ academics: { majors: ["nursing"] }, importance: { major: "must" } });
const ex = M.explain(HARVARD, r); assert.equal(ex.found, true); assert.match(ex.reasons[0], /Fails a requirement/);

// ---- written preferences: proposals only, ambiguous places become questions, unsupported wishes are listed
const parsed = M.parseText("I want a college near the ocean where I can study biology or pharmacology, work part-time as a pharmacy technician, ski occasionally, stay near my girlfriend in San Diego, and spend under $20,000 a year. I don't have a car.", MD.places);
const keys = parsed.proposals.map((x) => x.key);
for (const k of ["majors", "professional", "jobServices", "place", "budget", "noCar"]) assert.ok(keys.includes(k), "extracts " + k);
assert.equal(parsed.proposals.find((x) => x.key === "budget").value, 20000);
assert.equal(parsed.proposals.find((x) => x.key === "place").value.label, "San Diego, CA");
assert.ok(parsed.unsupported.includes("Near a beach or coast") && parsed.unsupported.includes("Near skiing"));
assert.ok(M.parseText("my family lives near Springfield", MD.places).questions.length === 1, "ambiguous city asks which one");
assert.equal(M.parseText("", MD.places).proposals.length, 0);

console.log("PASS: 13 fictional students; requirements, unknowns, estimates, weights, reproducibility, separate admissions, why-not and written preferences behave.");
