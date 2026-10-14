/* FunSAT admissions model: ONE shared, versioned interface for the college UI and the AI tutor.
   Works in the browser (window.AdmissionsModel) and in Node (module.exports). Pure functions only:
   nothing here reads or writes the student's profile, the DOM, storage, or the network.

   Three modes, never blended:
     A. Official statistics + factual comparisons  (reportedRate, testPolicy, compareScore, compareGpa)
     B. Experimental heuristic estimate            (estimate)   <- labeled, abstains by default
     C. Outcome-validated prediction               NOT AVAILABLE: no representative outcome data exists yet.

   Every number the AI may say comes from analyze()/toAiContext(). See docs/admissions-methodology.md. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AdmissionsModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MODEL_VERSION = "exp-heuristic-0.1.0";
  const WARNING_TEXT = "Experimental estimate—not validated against representative admission outcomes. Actual decisions can differ substantially.";
  const UNSUPPORTED_CONTEXT_TEXT = "This may matter to admissions, but this estimate cannot quantify it.";

  // ---- Assumed parameters. None of these is fitted to admission outcomes; each is labeled "assumed". ----
  const BETA_ASSUMED = 0.5;                  // log-odds shift per step: below (-1), within (0), above (+1) the enrolled middle 50%
  const BETA_SENSITIVITY = [0, 1.0];         // alternative values re-run to show how much the assumed beta matters
  const MIN_RATE_ASSUMED = 10;               // percent; below this the pool-wide rate is too extreme to adjust responsibly
  const ASSUMPTIONS = Object.freeze([
    { name: "scoreStepBeta", value: BETA_ASSUMED, kind: "assumed", note: "Log-odds change per step below/within/above the enrolled middle 50%. Not fitted to outcomes." },
    { name: "minimumOfficialRatePercent", value: MIN_RATE_ASSUMED, kind: "assumed", note: "Estimate withheld below this official rate." },
    { name: "officialRate", value: "per college", kind: "sourced", note: "100 x admitted / applicants from the cited source." }
  ]);
  const NOT_MODELED = Object.freeze(["GPA and course rigor", "Early Decision / Early Action", "Recruited athlete or other hooks", "Residency and state quotas",
    "Intended major", "Essays, recommendations and activities", "Personal circumstances"]);

  const SENSITIVE_KEYS = /race|ethnic|gender|sex|religio|disab|income|immigra|citizen|orientation|health|nation|ancest|legacy|donor|famil/i;
  const EXTRACT_FIELDS = Object.freeze({
    sat: (v) => Number.isInteger(v) && v >= 400 && v <= 1600,
    act: (v) => Number.isInteger(v) && v >= 1 && v <= 36,
    gpa: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5,
    gpaScale: (v) => ["4uw", "4w", "5", "100"].includes(v),
    testType: (v) => v === "sat" || v === "act",
    submitScore: (v) => typeof v === "boolean"
  });

  // ---------------------------------------------------------------- helpers
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const safeHttps = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:"; } catch (e) { return false; } };
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const logit = (p) => Math.log(p / (1 - p));
  const isoDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

  function fmtRate(rate) { return isNum(rate) ? (Math.round(rate * 10) / 10).toFixed(1).replace(/\.0$/, "") + "%" : "unknown"; }
  function fmtPoint(pct) { return !isNum(pct) ? "unavailable" : pct < 1 ? "<1%" : pct > 99 ? ">99%" : Math.round(pct) + "%"; }

  function dataset(explicit) { return explicit || (root && root.ADMISSIONS_DATA) || null; }

  // ---------------------------------------------------------------- Mode A: official statistics
  /* Official acceptance rate. Counts win over the displayed rate; invalid counts never override it.
     Returns rate = null when nothing valid is known. 0 and 100 are real values, not "missing". */
  function reportedRate(college, data) {
    const c = college || {};
    const out = { rate: null, applicants: null, admitted: null, countsKnown: false, year: null, cohortLabel: null, population: null,
      sourceName: null, sourceUrl: null, releaseStatus: null, publishedDate: null, retrievedDate: null, tier: "none", note: null };
    const d = dataset(data);
    const inline = c.admissions && typeof c.admissions === "object" ? c.admissions : null;
    const fromSet = d && d.byId && c.id != null ? d.byId[String(c.id)] : null;
    let src = null;
    if (inline) src = { applicants: inline.applicants, admitted: inline.admitted, year: inline.year, sourceUrl: inline.sourceUrl, population: inline.population,
      sourceName: inline.sourceName || "Institution-published admissions data", releaseStatus: inline.releaseStatus || null, publishedDate: inline.publishedDate || null,
      retrievedDate: inline.verifiedAt || inline.retrievedDate || null, cohortLabel: inline.cohortLabel || null };
    else if (fromSet && d.meta) {
      // A verified newer record carries its own cohort/source/dates; otherwise the bulk file's metadata applies.
      const own = fromSet.verified === true;
      src = { applicants: fromSet.applicants, admitted: fromSet.admitted, year: own ? fromSet.year : d.meta.cohortYear, sourceUrl: own ? fromSet.sourceUrl : d.meta.sourceUrl,
        population: own ? fromSet.population : d.meta.population, sourceName: own ? fromSet.sourceName : d.meta.sourceName, releaseStatus: own ? fromSet.releaseStatus : d.meta.releaseStatus,
        publishedDate: own ? fromSet.publishedDate : d.meta.publishedDate, retrievedDate: own ? fromSet.retrievedDate : d.meta.retrievedDate, cohortLabel: own ? fromSet.cohortLabel : d.meta.cohortLabel };
    }
    if (src && Number.isInteger(src.applicants) && Number.isInteger(src.admitted) && src.applicants > 0 && src.admitted >= 0 && src.admitted <= src.applicants
        && Number.isInteger(src.year) && safeHttps(src.sourceUrl)) {
      return Object.assign(out, { rate: 100 * src.admitted / src.applicants, applicants: src.applicants, admitted: src.admitted, countsKnown: true, year: src.year,
        cohortLabel: src.cohortLabel || ("Fall " + src.year + " entering class"), population: src.population || null, sourceName: src.sourceName, sourceUrl: src.sourceUrl,
        releaseStatus: src.releaseStatus, publishedDate: isoDate(src.publishedDate) ? src.publishedDate : null, retrievedDate: isoDate(src.retrievedDate) ? src.retrievedDate : null, tier: "counts" });
    }
    if (isNum(c.adm) && c.adm >= 0 && c.adm <= 100) {
      return Object.assign(out, { rate: c.adm, tier: "scorecard-rate", sourceName: "U.S. Dept. of Education, College Scorecard (rate only; no counts)",
        sourceUrl: "https://collegescorecard.ed.gov/data/", cohortLabel: "Cohort year unverified", releaseStatus: "College Scorecard Most-Recent-Cohorts file, May 2026 release",
        note: src ? "Counts for this college failed validation, so the displayed rate is used." : "Applicant and admit counts are not available for this college." });
    }
    return out;
  }

  /* required | optional | blind | unknown. Only explicit data counts; there is no guessing from state or school type.
     The IPEDS test code is carried by the data but NOT interpreted, because its code-to-label mapping is unconfirmed. */
  function testPolicy(college, data) {
    // A hand-verified policy (with a cited source) outranks the free-text `test` field.
    const d = dataset(data), ov = d && d.policy && college && college.id != null ? d.policy[String(college.id)] : null;
    if (ov && ["required", "optional", "blind"].includes(ov.policy) && safeHttps(ov.sourceUrl)) return ov.policy;
    const t = String((college && college.test) || "").trim().toLowerCase();
    if (!t) return "unknown";
    if (/not considered|test[- ]blind/.test(t)) return "blind";
    if (/optional/.test(t)) return "optional";
    if (/^required\b/.test(t)) return "required";
    return "unknown";
  }

  function rangeFor(college, testType) {
    const c = college || {};
    const lo = testType === "act" ? c.ar25 : c.sr25, hi = testType === "act" ? c.ar75 : c.sr75;
    return isNum(lo) && isNum(hi) && lo <= hi ? { lo, hi } : null;
  }

  /* Factual comparison against the ENROLLED students' middle 50%. Never a percentile, never a cutoff. */
  function compareScore(college, input, data) {
    const inp = input || {};
    const testType = inp.testType === "act" ? "act" : "sat";
    const policy = testPolicy(college, data);
    const score = isNum(Number(inp[testType])) && Number(inp[testType]) > 0 ? Number(inp[testType]) : null;
    const base = { status: "unknown", reason: null, test: testType, score, practiceEstimate: !!inp.scoreIsPracticeEstimate, lo: null, hi: null, policy,
      rangeBasis: "Enrolled students' 25th–75th percentile, not admitted applicants and not a cutoff", rangeYear: null };
    if (policy === "blind") return Object.assign(base, { status: "not-considered", reason: "This college does not consider SAT/ACT scores." });
    if (score == null) return Object.assign(base, { reason: "No " + testType.toUpperCase() + " score entered." });
    const r = rangeFor(college, testType);
    if (!r) return Object.assign(base, { reason: "This college does not report a " + testType.toUpperCase() + " range." });
    const status = score < r.lo ? "below" : score > r.hi ? "above" : "within";
    return Object.assign(base, { status, lo: r.lo, hi: r.hi });
  }

  /* GPA is only comparable when an institution publishes a GPA on the same scale. The catalog has none. */
  function compareGpa(college, input) {
    return { status: "unknown", reason: "No published GPA for this college on a matching scale, so GPA is not compared.", gpaEntered: !!(input && isNum(Number(input.gpa)) && Number(input.gpa) > 0) };
  }

  // ---------------------------------------------------------------- Mode B: experimental heuristic
  function stepOf(status) { return status === "below" ? -1 : status === "above" ? 1 : 0; }
  function unavailable(reason, extra) {
    return Object.assign({ modelVersion: MODEL_VERSION, mode: "experimental-heuristic", available: false, reason, point: null, display: "estimate unavailable",
      sensitivity: null, probability: null, calibrated: false, confidence: "uncalibrated", validation: "not validated", warning: WARNING_TEXT,
      assumptions: ASSUMPTIONS, inputsUsed: [], inputsIgnored: [], notModeled: NOT_MODELED }, extra || {});
  }

  function estimate(college, input, data) {
    const inp = input || {};
    const policy = testPolicy(college, data);
    const rate = reportedRate(college, data);
    const cmp = compareScore(college, inp, data);
    const ignored = [];
    if (policy === "blind" && cmp.score != null) ignored.push(cmp.test.toUpperCase() + " score (test-blind college)");
    if (compareGpa(college, inp).gpaEntered) ignored.push("GPA (no comparable institutional GPA)");
    if (rate.rate == null) return unavailable("No valid official acceptance rate for this college.", { inputsIgnored: ignored });
    if (rate.rate <= 0 || rate.rate >= 100) return unavailable("The official rate is " + fmtRate(rate.rate) + ", so there is nothing to adjust.", { inputsIgnored: ignored });
    if (rate.rate < MIN_RATE_ASSUMED) return unavailable("Below an assumed " + MIN_RATE_ASSUMED + "% official-rate cutoff the pool-wide rate is too extreme to adjust for one applicant. Use the official rate.", { inputsIgnored: ignored });
    if (policy === "unknown") return unavailable("This college's SAT/ACT policy is not confirmed in our data.", { inputsIgnored: ignored });
    if (policy === "blind") return unavailable("This college is test-blind; scores are ignored, and no other factor is quantified.", { inputsIgnored: ignored });
    if (policy === "optional" && inp.submitScore !== true) return unavailable("This college is test-optional and you have not said you will submit a score.", { inputsIgnored: ignored });
    if (!["below", "within", "above"].includes(cmp.status)) return unavailable(cmp.reason || "No usable score comparison.", { inputsIgnored: ignored });
    const base = logit(rate.rate / 100), step = stepOf(cmp.status);
    const at = (beta) => Math.round(100 * sigmoid(base + beta * step));
    const point = at(BETA_ASSUMED);
    const alts = BETA_SENSITIVITY.map(at).concat(point);
    return {
      modelVersion: MODEL_VERSION, mode: "experimental-heuristic", available: true, reason: null, point, display: fmtPoint(point),
      sensitivity: { lo: Math.min.apply(null, alts), hi: Math.max.apply(null, alts), betas: BETA_SENSITIVITY.concat(BETA_ASSUMED), label: "Sensitivity to an assumed coefficient—not a confidence interval" },
      probability: null, calibrated: false, confidence: "uncalibrated", validation: "not validated", warning: WARNING_TEXT,
      assumptions: ASSUMPTIONS, inputsUsed: ["official rate (" + rate.tier + ")", cmp.test.toUpperCase() + " vs enrolled middle 50% (" + cmp.status + ")"], inputsIgnored: ignored, notModeled: NOT_MODELED
    };
  }

  /* Hypothetical comparison through the SAME estimator. Never mutates the input; never a causal promise. */
  function whatIf(college, input, patch, data) {
    const merged = Object.assign({}, input || {}, patch || {});
    return { hypothetical: true, label: "Hypothetical only—not a prediction that this change would cause a different outcome.", patch: Object.assign({}, patch || {}),
      base: estimate(college, input, data), changed: estimate(college, merged, data) };
  }

  // ---------------------------------------------------------------- one analysis for UI and AI
  function analyze(college, input, data) {
    const c = college || {}, inp = input || {};
    return Object.freeze({ modelVersion: MODEL_VERSION, college: { id: c.id == null ? null : c.id, name: c.n || null },
      official: reportedRate(c, data), policy: testPolicy(c, data), score: compareScore(c, inp, data), gpa: compareGpa(c, inp), estimate: estimate(c, inp, data),
      unsupportedContext: Array.isArray(inp.unsupportedContext) ? inp.unsupportedContext.map(String).slice(0, 10) : [], unsupportedContextNote: UNSUPPORTED_CONTEXT_TEXT });
  }

  /* Percentages the AI may state: only values this analysis produced. */
  function allowedPercents(a) {
    const s = new Set();
    if (a.official && a.official.rate != null) { s.add(String(Math.round(a.official.rate * 10) / 10)); s.add(String(Math.round(a.official.rate))); }
    if (a.estimate && a.estimate.available) { s.add(String(a.estimate.point)); s.add(String(a.estimate.sensitivity.lo)); s.add(String(a.estimate.sensitivity.hi)); }
    return s;
  }

  function toAiContext(college, input, data) {
    const a = analyze(college, input, data);
    const o = a.official, sc = a.score, e = a.estimate;
    const lines = [
      "ADMISSIONS FACTS (computed by the app; you may restate these numbers but must never create, change, or add percentages):",
      "College: " + (a.college.name || "unknown") + ". SAT/ACT policy: " + a.policy + ".",
      o.rate == null ? "Official acceptance rate: unknown." : "Official acceptance rate: " + fmtRate(o.rate) + " (" + (o.countsKnown ? o.admitted + " admitted of " + o.applicants + " applicants, " + o.cohortLabel : o.cohortLabel + ", counts unavailable") + "; " + o.sourceName + ").",
      "Score comparison: " + (sc.status === "unknown" ? "unknown (" + sc.reason + ")" : sc.status === "not-considered" ? "scores not considered" : sc.test.toUpperCase() + " " + sc.score + " is " + sc.status + " the enrolled middle 50% (" + sc.lo + "–" + sc.hi + "). Enrolled ranges are not admission cutoffs."),
      "GPA comparison: " + a.gpa.reason,
      e.available ? "Experimental estimate: " + e.display + " (sensitivity " + e.sensitivity.lo + "%–" + e.sensitivity.hi + "%, not a confidence interval). " + WARNING_TEXT : "Experimental estimate: unavailable (" + e.reason + ")",
      "Not modeled: " + NOT_MODELED.join("; ") + ". For any of these say: \"" + UNSUPPORTED_CONTEXT_TEXT + "\"",
      "Never state a waitlist or deny percentage. Never raise or lower the estimate because of essays, activities, or personal circumstances."
    ];
    return { analysis: a, text: lines.join("\n"), allowedPercents: Array.from(allowedPercents(a)) };
  }

  /* Remove any percentage in an AI reply that the estimator did not produce. Display-time guard. */
  function guardAiReply(text, allowed) {
    const ok = new Set((allowed || []).map(String));
    let removed = 0;
    const out = String(text == null ? "" : text).replace(/(\d+(?:\.\d+)?)\s*(%|percent\b)/gi, (m, n) => {
      if (ok.has(n) || ok.has(String(Math.round(Number(n) * 10) / 10))) return m;
      removed += 1; return "[unverified percentage removed]";
    });
    return { text: out, removed };
  }

  /* Validate AI-extracted profile facts. Each field must carry the student's own supporting statement.
     Sensitive attributes, probabilities, and unknown keys are rejected, never passed through. */
  function validateExtraction(obj, sourceText) {
    const accepted = {}, rejected = [], quotes = {}, unsupported = [];
    const src = typeof sourceText === "string" ? sourceText : null;
    const items = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    Object.keys(items).forEach((key) => {
      const item = items[key];
      if (key === "unsupportedContext") { (Array.isArray(item) ? item : []).slice(0, 10).forEach((s) => { if (typeof s === "string" && s.trim()) unsupported.push(s.trim().slice(0, 200)); }); return; }
      if (SENSITIVE_KEYS.test(key)) { rejected.push({ key, reason: "sensitive characteristic; never inferred or used" }); return; }
      if (!Object.prototype.hasOwnProperty.call(EXTRACT_FIELDS, key)) { rejected.push({ key, reason: "not an allowed field" }); return; }
      const value = item && typeof item === "object" ? item.value : undefined, quote = item && typeof item === "object" ? item.quote : undefined;
      if (item && typeof item === "object" && item.explicit === false) { rejected.push({ key, reason: "inferred, not explicitly stated" }); return; }
      if (!EXTRACT_FIELDS[key](value)) { rejected.push({ key, reason: "invalid value" }); return; }
      if (typeof quote !== "string" || !quote.trim()) { rejected.push({ key, reason: "no supporting statement" }); return; }
      if (src !== null && !src.toLowerCase().includes(quote.trim().toLowerCase())) { rejected.push({ key, reason: "supporting statement not found in the student's text" }); return; }
      accepted[key] = value; quotes[key] = quote.trim().slice(0, 200);
    });
    return { accepted, quotes, rejected, unsupportedContext: unsupported };
  }

  return Object.freeze({ MODEL_VERSION, WARNING_TEXT, UNSUPPORTED_CONTEXT_TEXT, ASSUMPTIONS, NOT_MODELED, reportedRate, testPolicy, compareScore, compareGpa, estimate, whatIf,
    analyze, toAiContext, guardAiReply, validateExtraction, fmtRate, fmtPoint });
});
