/* Offline calibration pipeline: leakage guards, synthetic fixtures can never validate, reports are machine-readable. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "calib-"));
const py = (args) => execFileSync("python3", ["-I", ...args], { encoding: "utf8" });

py(["calibration/make_synthetic_fixture.py"]);
const csv = "calibration/fixtures/synthetic-v1.csv", meta = "calibration/fixtures/synthetic-v1.meta.json";
const out = path.join(tmp, "report.json");
py(["calibration/fit.py", "--data", csv, "--meta", meta, "--out", out]);
const rep = JSON.parse(fs.readFileSync(out, "utf8"));

assert.equal(rep.status, "not validated", "synthetic data can never produce a validated status");
assert.ok(rep.statusReasons.some((r) => /synthetic/.test(r)), "report says why");
assert.equal(rep.dataset.isSynthetic, true);
assert.ok(/synthetic/i.test(path.basename(csv)), "fixture file name says synthetic");
const rows = fs.readFileSync(csv, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
assert.ok(rows.every((r) => r[r.length - 1] === "1" && r[r.length - 2] === "synthetic" && r[0].startsWith("SYN-")), "every fixture row is flagged synthetic");

// Applicant and time splits: no leakage, and repeated applicants were dropped rather than leaked.
const L = rep.splits.leakage;
assert.equal(L.applicantOverlapTrainCal + L.applicantOverlapTrainTest + L.applicantOverlapCalTest, 0, "no applicant appears in two folds");
assert.ok(rep.splits.rowsDroppedForApplicantLeakage > 0, "the fixture's repeated applicants were removed");
assert.ok(rep.splits.testCycle > rep.splits.calibrationCycle && rep.splits.calibrationCycle > Math.max(...rep.splits.trainCycles), "train < calibration < test in time");
assert.equal(rep.calibration.isotonicEligible, false, "isotonic is withheld without enough calibration rows");
assert.ok(!rep.calibration.methodsCompared.includes("isotonic"));
for (const name of ["baselineRateOnly", "uncalibrated", "sigmoid"]) {
  const m = rep.metrics.test[name];
  assert.ok(m && m.n > 0 && Number.isFinite(m.logLoss) && Number.isFinite(m.brier) && Number.isFinite(m.ece), name + " has log loss, Brier and ECE");
  assert.ok(m.reliability.every((b) => b.n > 0), "reliability bins carry support counts");
}
assert.match(rep.interpretation, /Brier score alone/);

// Contract enforcement: fewer than three cycles, missing metadata, and disallowed sources are all refused or marked.
const two = path.join(tmp, "two.csv");
const lines = fs.readFileSync(csv, "utf8").trim().split("\n");
fs.writeFileSync(two, [lines[0], ...lines.slice(1).filter((l) => /,202[12],/.test(l))].join("\n"));
py(["calibration/fit.py", "--data", two, "--meta", meta, "--out", path.join(tmp, "two.json")]);
const twoRep = JSON.parse(fs.readFileSync(path.join(tmp, "two.json"), "utf8"));
assert.equal(twoRep.status, "not validated");
assert.equal(twoRep.splits, null, "no temporal split without three cycles");

const badMeta = path.join(tmp, "bad.json");
fs.writeFileSync(badMeta, JSON.stringify({ datasetId: "x" }));
assert.throws(() => execFileSync("python3", ["-I", "calibration/fit.py", "--data", csv, "--meta", badMeta, "--out", path.join(tmp, "bad.out")], { stdio: "pipe" }), "incomplete provenance metadata is rejected");

const claimsReal = path.join(tmp, "real-claim.json");
fs.writeFileSync(claimsReal, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, "utf8")), isSynthetic: false, sourceType: "aggregate" }));
py(["calibration/fit.py", "--data", csv, "--meta", claimsReal, "--out", path.join(tmp, "agg.json")]);
const agg = JSON.parse(fs.readFileSync(path.join(tmp, "agg.json"), "utf8"));
assert.equal(agg.status, "not validated", "mislabeling the metadata does not launder synthetic rows or aggregate sources");

// The site must never read calibration output.
for (const f of ["college.js", "admissions-model.js", "worker/index.js", "redesign.js"]) {
  assert.ok(!/calibration\//.test(fs.readFileSync(f, "utf8")), f + " does not load calibration artifacts");
}
for (const f of ["wrangler.toml", "wrangler.preview.toml"]) assert.ok(!/calibration/.test(fs.readFileSync(f, "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n")), f + " does not publish calibration files");

console.log("PASS: calibration pipeline: applicant+time leakage guards, synthetic/aggregate data cannot validate, contract enforced, reports machine-readable, never shipped.");
