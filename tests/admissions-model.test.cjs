/* Admissions evidence model: published-rate arithmetic, test policy, and the
   calibration pipeline. Dataset objects below are clearly synthetic fixtures
   for exercising code paths — they are NOT validation evidence for any model. */
const assert = require("node:assert/strict");
const model = require("../admissions-model.js");

// ---- reportedRate: exact arithmetic and quarantining ----
const ucla = model.reportedRate({
  adm: 9,
  admissions: { applicants: 145085, admitted: 13659, year: 2025, sourceUrl: "https://admission.ucla.edu/apply/first-year/first-year-profile/2025", verifiedAt: "2026-10-14", population: "First-time, first-year applicants; all rounds" },
});
assert.ok(Math.abs(ucla.rate - (13659 / 145085) * 100) < 1e-10, "rate computed without intermediate rounding");
assert.equal(ucla.year, 2025);
assert.equal(ucla.countsKnown, true);
assert.equal(ucla.population, "First-time, first-year applicants; all rounds");
assert.equal(model.reportedRate({ adm: 0 }).rate, 0, "zero is data, not missing");
assert.equal(model.reportedRate({ adm: 100 }).rate, 100, "100% is not capped");
assert.equal(model.reportedRate({ adm: null }).rate, null, "missing stays missing");
assert.equal(model.reportedRate({ adm: 120 }).rate, null, "out-of-range values are quarantined");
assert.equal(model.reportedRate({}).rate, null, "empty input is missing");
assert.equal(model.reportedRate({ adm: 9, admissions: { applicants: 10, admitted: 11 } }).countsKnown, false, "admitted > applicants is invalid");
assert.equal(model.reportedRate({ adm: 9, admissions: { applicants: -5, admitted: 2, year: 2025, sourceUrl: "https://x.example/a" } }).countsKnown, false, "negative applicants invalid");
assert.equal(model.reportedRate({ adm: 9, admissions: { applicants: 10, admitted: 5, year: 2025, sourceUrl: "javascript:alert(1)" } }).countsKnown, false, "unsafe URL cannot supply evidence");
assert.equal(model.reportedRate({ adm: 9, admissions: { applicants: 10, admitted: 5, year: 2025, sourceUrl: "https://x.example/a" } }).countsKnown, true, "complete safe counts are accepted");
assert.equal(model.reportedRate({ adm: 9, admissions: { applicants: 10, admitted: 5, year: 2025, sourceUrl: "https://x.example/a" } }).rate, 50, "small-count arithmetic still exact");
assert.notEqual(model.reportedRate({ adm: 9, admissions: { applicants: 10, admitted: 5, year: 2025, sourceUrl: "https://x.example/a" } }).rate, 9, "counts override the released percentage");

// ---- Test policy ----
assert.equal(model.ignoresScores({ st: "CA", ctrl: "public", test: "Considered" }), true, "UC/CSU system policy is not overridden by stale coding");
assert.equal(model.ignoresScores({ st: "TX", ctrl: "private", test: "Not considered" }), true, "explicit institutional policy is honored");
assert.equal(model.ignoresScores({ st: "TX", ctrl: "private", test: "Test-blind" }), true, "'test-blind' wording is honored");
assert.equal(model.ignoresScores({ st: "TX", ctrl: "private", test: "Considered" }), false, "considered is not ignored");
assert.equal(model.ignoresScores({ st: "TX", ctrl: "private", test: "Test-optional" }), false, "optional still allows score use");
assert.equal(model.testPolicy({ st: "TX", ctrl: "private" }).key, "unknown", "unreported policy is unknown, not assumed");

// ---- Feature extraction is versioned ----
const feats = model.extractFeatures({ college: { adm: 20 }, score: 1300, rangeLo: 1200, rangeHi: 1400, gpa: 3.5 });
assert.equal(feats.featuresVersion, model.FEATURES_VERSION);
assert.equal(feats.publishedRate, 0.2);
assert.equal(feats.scorePosition, 0.5);
assert.equal(model.extractFeatures({ college: { st: "CA", ctrl: "public" }, score: 1400, rangeLo: 1200, rangeHi: 1400 }).testIgnored, 1);

// ---- Splits never leak applicants across halves ----
const records = Array.from({ length: 100 }, (_, i) => ({ id: "r" + i, applicantId: "a" + (i % 40), appliedAt: 2020 + (i % 5), outcome: i % 2 === 0 }));
const timeSplit = model.splitByTime(records, 0.7);
assert.equal(timeSplit.train.length + timeSplit.test.length, 100);
assert.ok(Math.max(...timeSplit.train.map((r) => r.appliedAt)) <= Math.min(...timeSplit.test.map((r) => r.appliedAt)), "time split is chronological");
const appSplit = model.splitByApplicant(records, 0.7);
const trainIds = new Set(appSplit.train.map((r) => r.applicantId));
assert.ok(appSplit.test.every((r) => !trainIds.has(r.applicantId)), "no applicant appears in both halves");

// ---- Metrics ----
const perfect = [{ predicted: 1, outcome: true }, { predicted: 0, outcome: false }];
assert.equal(model.brierScore(perfect), 0);
assert.ok(model.logLoss(perfect) < 1e-6);
const wrong = [{ predicted: 0, outcome: true }, { predicted: 1, outcome: false }];
assert.ok(model.brierScore(wrong) > model.brierScore(perfect), "worse predictions score worse");
const bins = model.reliabilityBins([{ predicted: 0.05, outcome: false }, { predicted: 0.95, outcome: true }], 10);
assert.equal(bins.length, 2);
assert.ok(bins[0].observed === 0 && bins[1].observed === 1);

// ---- Abstention: no evidence, no numbers ----
const small = model.evaluateCalibration({ test: Array.from({ length: 10 }, () => ({ outcome: true, college: { adm: 20 } })), predict: () => 0.5 });
assert.equal(small.status, "insufficient-evidence");
assert.equal(small.brier, undefined, "abstains instead of reporting a meaningless metric");
assert.equal(model.evaluateCalibration({ test: records, minSample: 10 }).status, "unsupported", "no candidate model means no evaluation");

// ---- Synthetic fixtures exercise the evaluated path (not validation) ----
const synthetic = Array.from({ length: 400 }, (_, i) => ({
  id: "fixture" + i, outcome: i % 4 !== 0, college: { adm: 20, st: "TX", ctrl: "private", test: "Considered" }, score: 1200 + (i % 300), rangeLo: 1100, rangeHi: 1500, gpa: 3 + (i % 100) / 100, group: i % 2 ? "A" : "B",
}));
const evaluated = model.evaluateCalibration({ test: synthetic, minSample: 200, minSubgroup: 30, predict: (f) => 0.3 + 0.4 * (f.scorePosition || 0) });
assert.equal(evaluated.status, "evaluated");
assert.equal(evaluated.n, 400);
assert.ok(evaluated.brier >= 0 && evaluated.brier <= 1);
assert.ok(evaluated.baselineBrier >= 0, "base-rate baseline is computed for comparison");
assert.equal(evaluated.reliability.length > 0, true);
assert.ok(evaluated.subgroups.every((g) => typeof g.reportable === "boolean"), "subgroup sample-size checks are reported");

// ---- The live estimate is never calibrated without real outcome data ----
const status = model.calibrationStatus();
assert.equal(status.calibrated, false);
assert.equal(status.confidence, "uncalibrated");
assert.equal(status.featuresVersion, model.FEATURES_VERSION);

console.log("PASS: published-rate arithmetic, quarantine rules, test policy, versioned features, leak-free splits, calibration metrics with base-rate baseline, subgroup checks, and abstention.");
