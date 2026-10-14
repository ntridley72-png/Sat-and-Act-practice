/* Admissions model: official rates, comparisons, abstention, test-blind invariance, AI guard, UI/AI parity. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const AM = require("../admissions-model.js");

const dataSrc = fs.readFileSync("admissions-data.js", "utf8");
const DATA = JSON.parse(dataSrc.slice(dataSrc.indexOf("{"), dataSrc.lastIndexOf("}") + 1));

// ---- Mode A: official rates come from raw counts ----
// Newer hand-verified institution records carry their own cohort, source and dates (not the bulk file's).
const ucla = AM.reportedRate({ id: 110662, adm: 9 }, DATA);
assert.deepEqual([ucla.applicants, ucla.admitted, ucla.year], [145085, 13659, 2025]);
assert.match(ucla.sourceUrl, /admission\.ucla\.edu/);
assert.equal(ucla.publishedDate, null, "an unstated publication date stays unknown");
assert.equal(ucla.retrievedDate, "2026-10-14");
const berkeley = AM.reportedRate({ id: 110635, adm: 11 }, DATA);
assert.deepEqual([berkeley.applicants, berkeley.admitted, berkeley.year], [133154, 13967, 2026]);
assert.match(berkeley.cohortLabel, /Fall 2026/);
assert.match(berkeley.sourceUrl, /campuses-majors\/berkeley\//);
for (const id of [110635, 110644, 110653, 110662, 110671, 110680, 110705, 110714]) {
  assert.equal(AM.testPolicy({ id, test: "Considered" }, DATA), "blind", "UC campus " + id + " is test-blind via its cited source");
}
global.__restore = global.ADMISSIONS_DATA; global.ADMISSIONS_DATA = DATA;
assert.equal(AM.testPolicy({ id: 110662, test: "Considered" }), "blind", "verified policy outranks the ambiguous free-text field");
assert.equal(AM.testPolicy({ id: 999999, test: "Considered" }), "unknown");
global.ADMISSIONS_DATA = global.__restore;
// IPEDS bulk tier for a college with no newer record.
const harvard = { id: 166027, n: "Harvard", adm: 3.6 };
const r = AM.reportedRate(harvard, DATA);
assert.equal(r.tier, "counts");
assert.equal(r.applicants, DATA.byId["166027"].applicants);
assert.ok(Math.abs(r.rate - 100 * r.admitted / r.applicants) < 1e-12, "rate = 100 * admitted / applicants");
assert.equal(r.year, 2023, "cohort year is the file's cohort, not relabeled");
assert.equal(r.cohortLabel, "Fall 2023 entering class");
for (const k of ["publishedDate", "retrievedDate"]) assert.match(r[k], /^\d{4}-\d{2}-\d{2}$/, k + " is an ISO date");
assert.notEqual(r.publishedDate, r.retrievedDate, "publication and retrieval dates are different facts");
assert.match(r.sourceUrl, /^https:\/\//);
assert.ok(r.population && r.releaseStatus, "population and release status are carried");
const noCounts = AM.reportedRate({ id: 1, adm: 33.3 }, DATA);
assert.equal(noCounts.tier, "scorecard-rate");
assert.equal(noCounts.year, null, "Scorecard cohort year is not invented");
assert.match(noCounts.cohortLabel, /unverified/i);
assert.equal(AM.reportedRate({ adm: 0 }).rate, 0);
assert.equal(AM.reportedRate({ adm: 100 }).rate, 100);
assert.equal(AM.reportedRate({ adm: null }).rate, null);
assert.equal(AM.reportedRate({ adm: 120 }).rate, null);
assert.equal(AM.reportedRate({ adm: NaN }).rate, null);
assert.equal(AM.reportedRate({ adm: 9, admissions: { applicants: 10, admitted: 11, year: 2025, sourceUrl: "https://a.edu/x" } }).countsKnown, false);
assert.equal(AM.reportedRate({ adm: 9, admissions: { applicants: 10, admitted: 5, year: 2025, sourceUrl: "http://a.edu/x" } }).countsKnown, false, "http (not https) sources are rejected");

// ---- Test policy: explicit data only ----
assert.equal(AM.testPolicy({ test: "Required" }), "required");
assert.equal(AM.testPolicy({ test: "Not considered" }), "blind");
assert.equal(AM.testPolicy({ test: "Test optional" }), "optional");
assert.equal(AM.testPolicy({ test: "Considered" }), "unknown", "ambiguous labels stay unknown");
assert.equal(AM.testPolicy({ st: "CA", ctrl: "public" }), "unknown", "no guessing from state or control");

// ---- Score comparison: below/within/above, never a percentile ----
const req = { id: 7, n: "Req U", test: "Required", adm: 40, sr25: 1200, sr75: 1400, ar25: 26, ar75: 32 };
assert.equal(AM.compareScore(req, { sat: 1100 }).status, "below");
assert.equal(AM.compareScore(req, { sat: 1200 }).status, "within");
assert.equal(AM.compareScore(req, { sat: 1400 }).status, "within");
assert.equal(AM.compareScore(req, { sat: 1500 }).status, "above");
assert.equal(AM.compareScore(req, { testType: "act", act: 33 }).status, "above");
assert.equal(AM.compareScore(req, {}).status, "unknown");
assert.equal(AM.compareScore({ ...req, sr25: null, sr75: null }, { sat: 1300 }).status, "unknown");
assert.ok(!("percentile" in AM.compareScore(req, { sat: 1300 })), "no percentile is derived from two endpoints");
assert.equal(AM.compareScore(req, { sat: 1300, scoreIsPracticeEstimate: true }).practiceEstimate, true, "practice scores are labeled estimates");
assert.equal(AM.compareGpa(req, { gpa: 3.9 }).status, "unknown", "GPA is not compared without a matching scale");

// ---- Mode B: abstention and invariance ----
const blind = { ...req, test: "Not considered" };
const base = AM.estimate(blind, { sat: 400 }), top = AM.estimate(blind, { sat: 1600 });
assert.equal(JSON.stringify(base.display), JSON.stringify(top.display));
assert.equal(base.available, false);
assert.ok(base.inputsIgnored.some((s) => /test-blind/.test(s)), "ignored score is disclosed");
for (let sat = 400; sat <= 1600; sat += 100) {
  assert.equal(AM.estimate({ ...req, test: "" }, { sat }).available, false, "unknown policy never uses a score");
  assert.equal(AM.estimate(blind, { sat }).point, null, "test-blind score " + sat + " cannot create an estimate");
}
assert.equal(AM.estimate(req, {}).available, false, "no score, no estimate");
assert.equal(AM.estimate({ ...req, adm: 5 }, { sat: 1300 }).available, false, "below the rate cutoff is unavailable");
assert.equal(AM.estimate({ ...req, adm: 100 }, { sat: 1300 }).available, false);
assert.equal(AM.estimate({ ...req, adm: null }, { sat: 1300 }).available, false);
const opt = { ...req, test: "Test optional" };
assert.equal(AM.estimate(opt, { sat: 1300 }).available, false, "test-optional without submit intent is unavailable");
assert.equal(AM.estimate(opt, { sat: 1300, submitScore: true }).available, true);
const e = AM.estimate(req, { sat: 1500 });
assert.equal(e.available, true);
assert.equal(e.probability, null);
assert.equal(e.calibrated, false);
assert.equal(e.confidence, "uncalibrated");
assert.equal(e.validation, "not validated");
assert.equal(e.warning, "Experimental estimate—not validated against representative admission outcomes. Actual decisions can differ substantially.");
assert.ok(Number.isInteger(e.point), "whole percent only");
assert.match(e.sensitivity.label, /not a confidence interval/);
assert.ok(e.sensitivity.lo <= e.point && e.point <= e.sensitivity.hi);
assert.ok(e.assumptions.some((a) => a.kind === "assumed") && e.assumptions.some((a) => a.kind === "sourced"), "sourced and assumed inputs are distinguished");
for (const k of ["waitlist", "deny", "lo", "hi"]) assert.ok(!(k in e), "no invented field " + k);
assert.equal(AM.fmtPoint(0.2), "<1%");
assert.equal(AM.fmtPoint(99.6), ">99%");
// Context the model cannot quantify never moves the number.
const plain = AM.estimate(req, { sat: 1300 }).point;
assert.equal(AM.estimate(req, { sat: 1300, essays: "amazing", hardship: true, legacy: true, athlete: true, applyPlan: "early", unsupportedContext: ["first-gen"] }).point, plain);

// ---- What-if uses the same estimator and never mutates ----
const input = { sat: 1100 }, frozen = JSON.stringify(input);
const w = AM.whatIf(req, input, { sat: 1500 });
assert.equal(JSON.stringify(input), frozen, "what-if does not mutate the profile");
assert.equal(w.hypothetical, true);
assert.match(w.label, /Hypothetical/);
assert.equal(w.changed.point, AM.estimate(req, { sat: 1500 }).point, "what-if equals a direct estimate");

// ---- UI and AI read the same analysis ----
const ctx = AM.toAiContext(req, { sat: 1500 });
const a = AM.analyze(req, { sat: 1500 });
assert.deepEqual(JSON.parse(JSON.stringify(ctx.analysis)), JSON.parse(JSON.stringify(a)), "AI context is the analysis object the UI renders");
assert.ok(ctx.text.includes(a.estimate.display) && ctx.text.includes(AM.WARNING_TEXT), "AI sees the same estimate with its warning");
assert.ok(ctx.text.includes(AM.UNSUPPORTED_CONTEXT_TEXT), "AI is told how to describe unquantified context");
assert.ok(Object.isFrozen(a));

// ---- AI cannot add or override numbers ----
const allowed = ctx.allowedPercents;
const guarded = AM.guardAiReply("Your chance is 73%, waitlist 12 percent, but the official rate is " + AM.fmtRate(40) + ".", allowed);
assert.ok(!/73%/.test(guarded.text) && !/12 percent/.test(guarded.text), "invented percentages are removed");
assert.ok(/40%/.test(guarded.text), "estimator numbers survive");
assert.equal(guarded.removed, 2);
assert.equal(AM.guardAiReply("No numbers here.", allowed).removed, 0);

// ---- Extraction schema ----
const said = "My SAT was 1380 and I am a first-generation student with a 3.8.";
const ex = AM.validateExtraction({
  sat: { value: 1380, quote: "My SAT was 1380", explicit: true },
  gpa: { value: 3.8, quote: "a 3.8" },
  race: { value: "x", quote: "x" },
  probability: { value: 0.9, quote: "x" },
  act: { value: 30, quote: "I got a 30", explicit: true },
  gpaScale: { value: "4uw", quote: "uw", explicit: false },
  unsupportedContext: ["first-generation student"]
}, said);
assert.deepEqual(ex.accepted, { sat: 1380, gpa: 3.8 });
assert.equal(ex.quotes.sat, "My SAT was 1380");
const why = Object.fromEntries(ex.rejected.map((x) => [x.key, x.reason]));
assert.match(why.race, /sensitive/);
assert.match(why.probability, /not an allowed field/);
assert.match(why.act, /not found/);
assert.match(why.gpaScale, /inferred/);
assert.deepEqual(ex.unsupportedContext, ["first-generation student"]);

// ---- UI adapter: identical inputs give identical results as the model; failures never invent odds ----
function loadCollege(profile) {
  const context = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Boolean, Date, isFinite, Infinity, profile,
    state: { view: "start", plan: {}, keys: [], answers: {}, done: false }, cloud: { user: null }, window: {},
    document: { addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; } },
    $() { return null; }, render() {}, showScreen() {}, saveProfile() {}, predictScores() { return { sat: {}, act: {} }; },
    aiChat() { throw new Error("model unavailable"); }, recordTutorHelp() { return false; }, aiErrorText() { return ""; }, copyEquationText() {}, renderAiText() {},
    escapeHtml(s) { return String(s); }, localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout });
  context.window = context; context.globalThis = context;
  for (const f of ["college-data.js", "admissions-data.js", "admissions-model.js", "college.js"]) vm.runInContext(fs.readFileSync(f, "utf8"), context, { filename: f });
  return context;
}
const profile = { college: { testType: "sat", sat: 1500, gpa: 3.9, gpaScale: "4uw", showExperimental: true }, history: [] };
const ctxVm = loadCollege(profile);
const feature = ctxVm.collegeFeature;
const uiCollege = { ...req };
const uiEst = feature.estimateCollege(uiCollege);
assert.equal(uiEst.estimate, AM.estimate(uiCollege, { sat: 1500, testType: "sat", gpa: 3.9, gpaScale: "4uw" }).point / 100, "UI estimate equals model estimate for identical inputs");
assert.equal(uiEst.analysis.estimate.display, AM.toAiContext(uiCollege, { testType: "sat", sat: 1500 }).analysis.estimate.display, "UI display equals AI context display");

// Every experimental percentage in rendered markup sits in the same container as the warning text.
const src = fs.readFileSync("college.js", "utf8");
assert.ok(src.includes("adm-exp-num") && src.includes("adm-exp-warn"), "experimental number and warning are rendered together");
const expBlock = src.slice(src.indexOf("function experimentalHtml"), src.indexOf("function whatIfLine"));
assert.ok(/adm-exp-num[\s\S]{0,200}adm-exp-warn/.test(expBlock), "warning follows the number inside one row");
assert.ok(src.includes("AM.WARNING_TEXT"), "what-if and compare views also carry the warning");

console.log("PASS: admissions model: counts-based rates and provenance, policy gating, abstention, test-blind invariance, sensitivity labeling, hypothetical what-if, AI guard/extraction, UI == AI.");
