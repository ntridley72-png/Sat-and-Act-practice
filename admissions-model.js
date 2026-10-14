/* Admissions evidence and transparency model.
 *
 * Two jobs:
 *   1. reportedRate() — exact arithmetic on published institutional counts so
 *      the app never re-derives an admit rate from rounded display text, never
 *      substitutes a made-up prior for missing data, and quarantines unsafe
 *      sources. Published rates and app comparisons are different things and
 *      are returned in different fields.
 *   2. Calibration scaffolding — versioned feature extraction, applicant-level
 *      and time-based splits, Brier score / log loss / reliability bins
 *      against a base-rate baseline, subgroup sample-size checks, and
 *      abstention when evidence is insufficient.
 *
 * The app has no consented applicant-outcome dataset, so every live estimate
 * is reported as uncalibrated (probability: null). Synthetic fixtures in the
 * test suite exercise this code; they are tests, not validation evidence.
 * Collecting real outcomes requires consent and is out of scope here.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AdmissionsModel = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // Bump when any feature definition or model weight changes. Calibration
  // evidence recorded for an older version does not transfer to a newer one.
  const FEATURES_VERSION = "2026.10.14-1";

  function safeUrl(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#][^\s]*)?$/i.test(s)) return false;
    if (/[\u0000-\u001f"'<>]/.test(s)) return false;
    return true;
  }
  function isCount(v, positive) { return typeof v === "number" && isFinite(v) && (positive ? v > 0 : v >= 0); }

  // Point-in-time published admit rate for one college.
  // Returns { rate, year, countsKnown, applicants, admitted, sourceUrl,
  //           verifiedAt, population, releaseStatus, flags }.
  // rate is a percentage or null. null always means "not published in the
  // current data", never zero and never an estimate.
  function reportedRate(college) {
    const c = college || {};
    const out = {
      rate: null, year: null, countsKnown: false, applicants: null, admitted: null,
      sourceUrl: null, verifiedAt: null, population: null,
      releaseStatus: "unknown", flags: [],
    };
    const a = c.admissions && typeof c.admissions === "object" ? c.admissions : null;
    if (a) {
      const countsOk = isCount(a.applicants, true) && isCount(a.admitted, false) && a.admitted <= a.applicants;
      const urlOk = safeUrl(a.sourceUrl);
      const yearOk = Number.isInteger(a.year) && a.year >= 2000 && a.year <= 2100;
      if (countsOk && urlOk && yearOk) {
        out.rate = (a.admitted / a.applicants) * 100; // no intermediate rounding
        out.year = a.year;
        out.countsKnown = true;
        out.applicants = a.applicants;
        out.admitted = a.admitted;
        out.sourceUrl = String(a.sourceUrl).trim();
        out.verifiedAt = a.verifiedAt != null ? String(a.verifiedAt) : null;
        out.population = a.population != null ? String(a.population) : null;
        out.releaseStatus = a.releaseStatus != null ? String(a.releaseStatus) : "released";
        out.flags = Array.isArray(a.flags) ? a.flags.slice() : [];
        return out;
      }
      if (countsOk && !urlOk) out.flags.push("unsafe-or-missing-source-url");
      if (countsOk && !yearOk) out.flags.push("missing-or-invalid-cohort-year");
      if (!countsOk) out.flags.push("invalid-or-incomplete-counts");
    }
    // Fall back to the released percentage when it is in range.
    const adm = c.adm;
    if (isCount(adm, false) && adm <= 100) {
      out.rate = adm;
      out.releaseStatus = "released-percentage";
      return out;
    }
    if (adm != null) out.flags.push("source-value-out-of-range");
    return out;
  }

  // ---- Test policy ----
  // An institution that does not consider SAT/ACT cannot have scores influence
  // a comparison, even when a historical enrolled-student range exists.
  function testPolicy(college) {
    const c = college || {};
    const explicit = String(c.test || "").trim();
    if (/not considered|test[- ]?blind|not used|will not consider|won'?t consider/i.test(explicit)) {
      return { key: "not-considered", label: explicit, source: "institution-report" };
    }
    if (c.st === "CA" && c.ctrl === "public") {
      return { key: "not-considered", label: "UC/CSU system policy: SAT/ACT not considered", source: "system-policy" };
    }
    if (/optional/i.test(explicit)) return { key: "optional", label: explicit, source: "institution-report" };
    return { key: "unknown", label: explicit || "Not reported", source: explicit ? "institution-report" : "none" };
  }
  function ignoresScores(college) { return testPolicy(college).key === "not-considered"; }

  // ---- Versioned features for the documented improvement pipeline ----
  // Features are derived from data the student already entered plus published
  // institutional figures. No sensitive demographics are used.
  function extractFeatures(record) {
    const r = record || {};
    const college = r.college || {};
    const rate = reportedRate(college).rate;
    const score = typeof r.score === "number" ? r.score : null;
    const rangeLo = typeof r.rangeLo === "number" ? r.rangeLo : null;
    const rangeHi = typeof r.rangeHi === "number" ? r.rangeHi : null;
    const gpa = typeof r.gpa === "number" ? r.gpa : null;
    const scorePos = score != null && rangeLo != null && rangeHi != null && rangeHi > rangeLo
      ? Math.max(0, Math.min(1, (score - rangeLo) / (rangeHi - rangeLo))) : null;
    return {
      featuresVersion: FEATURES_VERSION,
      publishedRate: rate != null ? rate / 100 : null,
      scorePosition: scorePos,
      gpa: gpa,
      testIgnored: ignoresScores(college) ? 1 : 0,
    };
  }

  // ---- Evaluation utilities (used only when real consented outcome data exists) ----
  function splitByTime(records, ratio) {
    const cut = Math.max(1, Math.min(records.length - 1, Math.floor(records.length * (ratio == null ? 0.7 : ratio))));
    const sorted = records.slice().sort((a, b) => (a.appliedAt || 0) - (b.appliedAt || 0));
    return { train: sorted.slice(0, cut), test: sorted.slice(cut) };
  }
  function splitByApplicant(records, ratio) {
    // Group by applicant id so no applicant appears in both halves.
    const groups = new Map();
    records.forEach((r) => {
      const key = String(r.applicantId == null ? r.id : r.applicantId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const keys = [...groups.keys()];
    const cut = Math.max(1, Math.min(keys.length - 1, Math.floor(keys.length * (ratio == null ? 0.7 : ratio))));
    const train = [], test = [];
    keys.forEach((k, i) => (i < cut ? train : test).push(...groups.get(k)));
    return { train, test };
  }
  function brierScore(pairs) {
    if (!pairs.length) return null;
    return pairs.reduce((sum, p) => sum + Math.pow((p.predicted || 0) - (p.outcome ? 1 : 0), 2), 0) / pairs.length;
  }
  function logLoss(pairs, epsilon) {
    if (!pairs.length) return null;
    const e = epsilon == null ? 1e-9 : epsilon;
    return -pairs.reduce((sum, p) => {
      const q = Math.max(e, Math.min(1 - e, p.predicted || 0));
      return sum + ((p.outcome ? 1 : 0) * Math.log(q) + (1 - (p.outcome ? 1 : 0)) * Math.log(1 - q));
    }, 0) / pairs.length;
  }
  function reliabilityBins(pairs, binCount) {
    const bins = Math.max(2, Math.min(20, binCount == null ? 10 : binCount));
    const rows = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, predictedSum: 0, outcomeSum: 0 }));
    pairs.forEach((p) => {
      const q = Math.max(0, Math.min(0.999999, p.predicted || 0));
      const row = rows[Math.min(bins - 1, Math.floor(q * bins))];
      row.n += 1; row.predictedSum += q; row.outcomeSum += p.outcome ? 1 : 0;
    });
    return rows.filter((r) => r.n > 0).map((r) => ({ lo: r.lo, hi: r.hi, n: r.n, predicted: r.predictedSum / r.n, observed: r.outcomeSum / r.n }));
  }
  // Full held-out evaluation against a base-rate baseline with subgroup and
  // sample-size checks. Returns { status: "insufficient-evidence" } rather
  // than numbers when the held-out set is too small to be meaningful.
  function evaluateCalibration(options) {
    const o = options || {};
    const test = Array.isArray(o.test) ? o.test : [];
    const minSample = Number.isFinite(o.minSample) ? o.minSample : 200;
    const minSubgroup = Number.isFinite(o.minSubgroup) ? o.minSubgroup : 30;
    const predict = typeof o.predict === "function" ? o.predict : null;
    if (!predict) return { status: "unsupported", reason: "no-candidate-model" };
    if (test.length < minSample) return { status: "insufficient-evidence", n: test.length, minSample };
    const pairs = test.map((r) => ({ predicted: predict(extractFeatures(r)), outcome: !!r.outcome }));
    const baseRate = test.filter((r) => r.outcome).length / test.length;
    const baseline = test.map((r) => ({ predicted: baseRate, outcome: !!r.outcome }));
    const groups = new Map();
    test.forEach((r) => {
      const key = String(r.group == null ? "all" : r.group);
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    return {
      status: "evaluated",
      featuresVersion: FEATURES_VERSION,
      n: test.length,
      brier: brierScore(pairs),
      baselineBrier: brierScore(baseline),
      logLoss: logLoss(pairs),
      baselineLogLoss: logLoss(baseline),
      reliability: reliabilityBins(pairs, o.bins),
      subgroups: [...groups.entries()].map(([group, n]) => ({ group, n, reportable: n >= minSubgroup })),
      abstainBelow: minSample,
    };
  }
  // The live estimate is never calibrated until a versioned, consented outcome
  // evaluation passes. This is the single place that decides that state.
  function calibrationStatus() {
    return { calibrated: false, confidence: "uncalibrated", featuresVersion: FEATURES_VERSION, reason: "no-consented-outcome-evaluation" };
  }

  return {
    FEATURES_VERSION, reportedRate, testPolicy, ignoresScores, safeUrl,
    extractFeatures, splitByTime, splitByApplicant,
    brierScore, logLoss, reliabilityBins, evaluateCalibration, calibrationStatus,
  };
});
