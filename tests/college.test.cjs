/* College Score Goals: dataset integrity and estimate algorithm behavior. */
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

function loadFeature(profile) {
  const context = vm.createContext({
    console, Math, JSON, Object, Array, Number, String, Boolean, Date, isFinite, Infinity,
    profile,
    state: { view: "start", plan: {}, keys: [], answers: {}, done: false },
    cloud: { user: null },
    window: {},
    document: { addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; } },
    $() { return null; },
    render() {},
    showScreen() {},
    saveProfile() {},
    predictScores() { return { sat: {}, act: {} }; },
    aiChat() { throw new Error("no ai in unit test"); },
    recordTutorHelp() { return false; },
    aiErrorText() { return ""; },
    copyEquationText() {},
    renderAiText() {},
    escapeHtml(s) { return String(s); },
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout, clearTimeout,
  });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(fs.readFileSync("college-data.js", "utf8"), context, { filename: "college-data.js" });
  vm.runInContext(fs.readFileSync("college.js", "utf8"), context, { filename: "college.js" });
  return context.collegeFeature;
}

const profile = { college: null, history: [] };
const feature = loadFeature(profile);

(async () => {
  // ---- Dataset integrity ----
  const raw = fs.readFileSync("college-data.js", "utf8");
  const sandbox = { window: {} };
  vm.runInContext(raw + "\n;this.__data=window.COLLEGE_DATA;", vm.createContext(sandbox));
  const CD = sandbox.__data;
  assert(CD && Array.isArray(CD.colleges), "dataset loads");
  assert(CD.colleges.length >= 300, "at least 300 colleges, saw " + CD.colleges.length);
  assert(CD.meta && /College Scorecard/i.test(CD.meta.source), "official source labeled");
  assert(CD.meta.selection && CD.meta.note, "selection rule and enrolled-student note documented");
  assert(CD.concordance && CD.concordance.actToSat["30"] === 1370, "official concordance present");
  const ids = new Set();
  CD.colleges.forEach((c) => {
    assert(c.id && c.n && c.st && c.ctrl, "identity fields: " + JSON.stringify(c));
    assert(!ids.has(c.id), "duplicate id " + c.id);
    ids.add(c.id);
    assert(c.adm > 0 && c.adm <= 100, "admit rate range for " + c.n);
    if (c.sr25 != null) assert(c.sr25 >= 400 && c.sr25 < c.sr75 && c.sr75 <= 1600, "SAT range for " + c.n);
    if (c.ar25 != null) assert(c.ar25 >= 1 && c.ar25 < c.ar75 && c.ar75 <= 36, "ACT range for " + c.n);
  });
  const ucla = CD.colleges.find((c) => c.n.includes("Los Angeles") && (c.aka || []).includes("UCLA"));
  assert(ucla, "common abbreviation UCLA indexed");
  assert(CD.colleges.some((c) => !c.sr25 && !c.ar25), "colleges without reported ranges are included, not invented");

  // ---- Algorithm ----
  const base = { id: 1, n: "Test U", st: "TX", city: "Test", ctrl: "private", adm: 20, enr: 10000, sr25: 1200, sr50: 1300, sr75: 1400, url: "example.edu" };
  profile.college = { testType: "sat", sat: 1200, gpa: 3.4, gpaScale: "4uw" };
  const low = feature.estimateCollege({ ...base });
  profile.college.sat = 1400;
  const high = feature.estimateCollege({ ...base });
  assert(high.estimate > low.estimate, "higher SAT must raise the estimate");

  profile.college.sat = 1300; profile.college.gpa = 3.0;
  const lowGpa = feature.estimateCollege({ ...base });
  profile.college.gpa = 3.9;
  const highGpa = feature.estimateCollege({ ...base });
  assert(highGpa.estimate > lowGpa.estimate, "higher GPA must raise the estimate");

  const selective = feature.estimateCollege({ ...base, adm: 8 });
  const open = feature.estimateCollege({ ...base, adm: 80 });
  assert(open.estimate > selective.estimate, "higher admit rate must raise the estimate for the same profile");

  assert(low.estimate >= 0 && high.estimate <= 1, "estimate stays in 0..1");
  assert(low.lo <= low.estimate && low.estimate <= low.hi, "estimate inside its range");
  const noScore = feature.estimateCollege({ ...base });
  profile.college.sat = null;
  const missing = feature.estimateCollege({ ...base });
  assert((missing.hi - missing.lo) > (noScore.hi - noScore.lo), "missing score widens the uncertainty range");

  // ACT student compared with an SAT-only college uses the official concordance.
  profile.college = { testType: "act", act: 30, gpa: 3.7, gpaScale: "4uw" };
  const converted = feature.estimateCollege({ ...base });
  assert(converted.range && converted.range.scale === "sat", "SAT-only college compared on the SAT scale");
  assert(converted.score && converted.score.converted === true && converted.score.value === 1370, "ACT 30 converts to SAT 1370");

  // Targets: default 75th, and the midpoint uses the reported median when present.
  assert(converted.target.value === base.sr75, "default target is the 75th percentile");
  profile.college.targetMode = "mid";
  const mid = feature.estimateCollege({ ...base });
  assert(mid.target.value === Math.round((base.sr50 + base.sr75) / 2), "above-midrange target uses median and 75th");

  // Unanswered questions must never change the estimate, only the reminder.
  profile.college = { testType: "sat", sat: 1300, gpa: 3.6, gpaScale: "4uw" };
  const withoutHistory = feature.estimateCollege({ ...base }).estimate;
  profile.history = [{ id: "a1", done: true, totalAnswered: 10, total: 25 }];
  assert.equal(feature.estimateCollege({ ...base }).estimate, withoutHistory, "unanswered questions do not change the estimate");
  assert(/unanswered|blank/i.test(feature.unansweredReminder()), "unanswered questions are still surfaced as a reminder");

  // Three-way outcome model: accept + waitlist + deny = 1, bounded, and responsive to context.
  profile.college = { testType: "sat", sat: 1300, gpa: 3.5, gpaScale: "4uw", grade: "11" };
  const base3 = { id: 3, n: "Test U", st: "TX", city: "Test", ctrl: "private", adm: 20, enr: 10000, sr25: 1200, sr50: 1300, sr75: 1400, url: "example.edu" };
  const oct = feature.estimateCollege({ ...base3 });
  assert(Math.abs(oct.estimate + oct.waitlist + oct.deny - 1) < 1e-9, "accept + waitlist + deny must sum to 1");
  assert(oct.waitlist >= 0 && oct.waitlist <= 0.5, "waitlist share stays bounded");
  assert(["low", "medium", "high"].includes(oct.confidence), "confidence is labeled");
  assert(Array.isArray(oct.confNotes), "confidence notes exist");
  profile.college.applyPlan = "early";
  const early = feature.estimateCollege({ ...base3 });
  assert(early.estimate > oct.estimate, "early application raises the estimate");
  profile.college.appStrength = "strong";
  const strong = feature.estimateCollege({ ...base3 });
  assert(strong.estimate > early.estimate, "strong essays/recs raise the estimate");
  profile.college.appStrength = "developing";
  const developing = feature.estimateCollege({ ...base3 });
  assert(developing.estimate < strong.estimate, "developing essays/recs lower the estimate");
  const pieSource = fs.readFileSync("college.js", "utf8");
  assert(pieSource.includes("function pieHtml"), "pie renderer present");
  assert(pieSource.includes("collegeSavedPanel"), "saved colleges panel present");

  // Official ACT Composite rule is applied in both the results screen and the predictor.
  const html = fs.readFileSync("SAT & ACT Practice.html", "utf8");
  assert((html.match(/\["english", "math", "reading"\]/g) || []).length >= 2, "ACT composite uses English, Math, and Reading in both places");
  assert(html.includes("Science is optional and does not change it"), "ACT Science disclosure present");
  assert(html.includes("unansweredReminderHtml"), "unanswered questions are surfaced without changing estimates");
  assert(html.includes('data-college-open="predicted"'), "predicted-score screen links into College Score Goals");

  console.log("PASS: college dataset is sourced and internally consistent; the estimate rises with scores, GPA, and admit rate; conversions, targets, and the unanswered-questions rule behave.");
})().catch((error) => { console.error(error); process.exit(1); });
