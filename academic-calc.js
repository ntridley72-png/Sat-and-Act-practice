/* FunSAT academic calculations: GPA, grades, and SAT/ACT score combinations.
 *
 * One implementation for every calculator page and the app, tested in tests/academic-calc.test.cjs against
 * hand-worked examples. Pure functions, no DOM, no rounding of intermediate values: results carry full precision and
 * callers round only for display (round2). Works in the browser (window.FunSATCalc) and in Node.
 *
 * Grading policies differ between schools, so nothing here is hard-wired: scales, percent cutoffs, course-type weights
 * and whether failing grades earn a weight bonus are all parameters with common defaults.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FunSATCalc = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VERSION = "2026-11-24";

  // ---------------------------------------------------------------- grading scales
  // Letter -> grade points. "plusminus" is the most common US high school and college scale.
  const SCALES = {
    plusminus: { label: "A = 4.0 with plus/minus (A- 3.7, B+ 3.3 ...)", points: { "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7, "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0 } },
    aplus43: { label: "A+ = 4.3 with plus/minus", points: { "A+": 4.3, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7, "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0 } },
    whole: { label: "Whole letters only (A 4, B 3, C 2, D 1, F 0)", points: { "A+": 4, A: 4, "A-": 4, "B+": 3, B: 3, "B-": 3, "C+": 2, C: 2, "C-": 2, "D+": 1, D: 1, "D-": 1, F: 0 } },
  };
  const LETTERS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
  // Percent -> letter: the lowest percent that earns each letter (a common 10-point scale with plus/minus bands).
  const PERCENT_CUTOFFS = [["A+", 97], ["A", 93], ["A-", 90], ["B+", 87], ["B", 83], ["B-", 80], ["C+", 77], ["C", 73], ["C-", 70], ["D+", 67], ["D", 63], ["D-", 60], ["F", 0]];

  // Extra points added for course level when computing a weighted GPA (one common policy; schools vary).
  const DEFAULT_WEIGHTS = { regular: 0, honors: 0.5, ap: 1, ib: 1, de: 1 };
  const COURSE_TYPES = { regular: "Regular", honors: "Honors", ap: "AP", ib: "IB", de: "Dual enrollment" };

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const num = (v) => { if (isNum(v)) return v; if (typeof v !== "string" || !v.trim()) return NaN; const n = Number(v.trim()); return Number.isFinite(n) ? n : NaN; };
  const round2 = (v) => (isNum(v) ? Math.round((v + Number.EPSILON) * 100) / 100 : v);
  const clampPct = (v) => Math.max(0, v);

  function normLetter(s) {
    const t = String(s == null ? "" : s).trim().toUpperCase().replace(/\s+/g, "").replace("−", "-");
    return LETTERS.includes(t) ? t : null;
  }

  function percentToLetter(pct, cutoffs) {
    const p = num(pct);
    if (!isNum(p)) return null;
    for (const [letter, min] of cutoffs || PERCENT_CUTOFFS) if (p >= min) return letter;
    return "F";
  }

  /** Grade points for one grade. grade: a letter ("B+"), a percent (87 or "87%"), or {points: 3.3}. Returns NaN if unreadable.
   *  Non-graded marks (P, W, I, NG, blank) return null: they carry no grade points and are left out of GPA. */
  function gradePoints(grade, opts) {
    opts = opts || {};
    const scale = (SCALES[opts.scale] || SCALES.plusminus).points;
    const custom = opts.customScale;          // optional {letter: points}
    if (grade && typeof grade === "object" && isNum(grade.points)) return grade.points;
    const raw = String(grade == null ? "" : grade).trim();
    if (!raw || /^(P|PASS|W|WP|WF|I|INC|NG|AU|CR|NC|S|U)$/i.test(raw)) return null;
    const letter = normLetter(raw);
    if (letter) return custom && isNum(custom[letter]) ? custom[letter] : scale[letter];
    const pct = num(raw.replace(/%$/, ""));
    if (isNum(pct)) {
      if (pct < 0 || pct > 150) return NaN;
      const l = percentToLetter(pct, opts.cutoffs);
      return custom && isNum(custom[l]) ? custom[l] : scale[l];
    }
    return NaN;
  }

  /** One course. course: {grade, credits, type}. Returns {credits, unweighted, weighted, counted, error}. */
  function courseResult(course, opts) {
    opts = opts || {};
    const weights = Object.assign({}, DEFAULT_WEIGHTS, opts.weights || {});
    const credits = course.credits === undefined || course.credits === "" ? 1 : num(course.credits);
    if (!isNum(credits) || credits < 0) return { counted: false, error: "Credits must be 0 or more." };
    const pts = gradePoints(course.grade, opts);
    if (pts === null) return { counted: false, credits, note: "Not graded (pass, withdrawal or blank): left out of GPA." };
    if (!isNum(pts)) return { counted: false, error: "Use a letter grade (A, B+, ...) or a percent (0-100)." };
    const type = COURSE_TYPES[course.type] ? course.type : "regular";
    // Most weighted policies give no level bonus to a failing grade; schools that do can turn it on.
    const bonusOk = pts > 0 || opts.bonusOnFailing;
    const weighted = pts + (bonusOk ? (num(weights[type]) || 0) : 0);
    return { counted: credits > 0, credits, unweighted: pts, weighted, type };
  }

  /** GPA over a list of courses. Zero-credit courses are listed but carry no weight. Returns full-precision numbers. */
  function gpa(courses, opts) {
    let cr = 0, qpU = 0, qpW = 0;
    const rows = (courses || []).map((c) => {
      const r = courseResult(c, opts);
      if (r.counted) { cr += r.credits; qpU += r.unweighted * r.credits; qpW += r.weighted * r.credits; }
      return r;
    });
    return { credits: cr, qualityPoints: qpU, weightedQualityPoints: qpW, unweighted: cr ? qpU / cr : null, weighted: cr ? qpW / cr : null, rows };
  }

  /** Several terms: GPA for each, and cumulative over all of them (credit-weighted, not an average of term GPAs). */
  function termsGpa(terms, opts) {
    const per = (terms || []).map((t) => Object.assign({ name: t.name }, gpa(t.courses, opts)));
    const all = gpa((terms || []).flatMap((t) => t.courses || []), opts);
    return { terms: per, cumulative: all };
  }

  /** Add new courses to an existing cumulative GPA. prior: {gpa, credits}. A missing prior is treated as no history. */
  function cumulativeGpa(prior, courses, opts) {
    const pg = num(prior && prior.gpa), pc = num(prior && prior.credits);
    const hasPrior = isNum(pg) && isNum(pc) && pc > 0;
    const now = gpa(courses, opts);
    const totalCr = (hasPrior ? pc : 0) + now.credits;
    const totalQp = (hasPrior ? pg * pc : 0) + now.qualityPoints;
    return { term: now.unweighted, termCredits: now.credits, credits: totalCr, gpa: totalCr ? totalQp / totalCr : null, change: hasPrior && totalCr ? totalQp / totalCr - pg : null };
  }

  /** Average grade points needed in the remaining credits to reach a target cumulative GPA.
   *  Returns {needed, feasible, reason, best, worst}: best/worst are the GPAs reachable with all max or all zero. */
  function gpaNeeded(current, credits, remainingCredits, target, maxPoints) {
    const g = num(current), c = num(credits), r = num(remainingCredits), t = num(target), mx = isNum(num(maxPoints)) ? num(maxPoints) : 4;
    if (![g, c, r, t].every(isNum) || c < 0 || r <= 0) return { error: "Enter your current GPA, credits so far, and credits still to take (more than 0)." };
    const needed = (t * (c + r) - g * c) / r;
    const best = (g * c + mx * r) / (c + r), worst = (g * c) / (c + r);
    if (needed > mx + 1e-9) return { needed, feasible: false, best, worst, reason: "Even a " + mx.toFixed(1) + " in every remaining credit reaches " + best.toFixed(2) + ", short of " + t.toFixed(2) + "." };
    if (needed <= 0) return { needed: 0, feasible: true, best, worst, reason: "You stay at or above " + t.toFixed(2) + " even with the lowest grades." };
    return { needed, feasible: true, best, worst };
  }

  /** Retaking a course. policy "replace": the new grade replaces the old one and credits do not change.
   *  policy "average": both attempts count, so credits grow. */
  function retakeGpa(current, credits, course, policy) {
    const g = num(current), c = num(credits), cr = num(course.credits), oldP = num(course.oldPoints), newP = num(course.newPoints);
    if (![g, c, cr, oldP, newP].every(isNum) || c <= 0 || cr <= 0) return { error: "Enter your GPA, credits, and the course's credits and both grades." };
    if (policy === "replace") {
      if (cr > c) return { error: "The course has more credits than your total." };
      return { gpa: (g * c - oldP * cr + newP * cr) / c, credits: c, policy };
    }
    return { gpa: (g * c + newP * cr) / (c + cr), credits: c + cr, policy: "average" };
  }

  /** Project a GPA term by term: plan = [{credits, gpa}]. Returns the cumulative after each term. */
  function projectGpa(current, credits, plan) {
    let qp = num(current) * num(credits), cr = num(credits);
    if (!isNum(qp)) { qp = 0; cr = 0; }
    return (plan || []).map((p, i) => {
      const pc = num(p.credits), pg = num(p.gpa);
      if (isNum(pc) && isNum(pg) && pc > 0) { qp += pc * pg; cr += pc; }
      return { term: i + 1, gpa: cr ? qp / cr : null, credits: cr };
    });
  }

  // ---------------------------------------------------------------- class grades
  /** Points grade: items [{earned, possible}]. An item with possible 0 and earned > 0 is extra credit (adds points only).
   *  Items with a blank score are not graded yet and are skipped. */
  function pointsGrade(items) {
    let e = 0, p = 0, graded = 0;
    for (const it of items || []) {
      const ea = num(it.earned), po = it.possible === "" || it.possible == null ? NaN : num(it.possible);
      if (!isNum(ea)) continue;
      if (isNum(po) && po > 0) { e += ea; p += po; graded++; }
      else if (isNum(po) && po === 0 && ea > 0) { e += ea; graded++; }
    }
    return { earned: e, possible: p, graded, percent: p > 0 ? (e / p) * 100 : null };
  }

  /** Weighted categories: [{name, weight, items:[{earned, possible}], dropLowest, score}].
   *  A category can give its own percent as `score` instead of items. Categories with nothing graded are left out and
   *  the remaining weights are scaled up, which is how most gradebooks show a grade mid-term (missing work entered as 0
   *  counts; blank does not). Returns the course percent and the share of the course weight that has been graded. */
  function weightedGrade(categories) {
    let wsum = 0, acc = 0, total = 0;
    const rows = (categories || []).map((c) => {
      const w = num(c.weight);
      if (!isNum(w) || w < 0) return { name: c.name, error: "Weight must be 0 or more." };
      total += w;
      let pct = num(c.score);
      if (!isNum(pct)) {
        let items = (c.items || []).filter((it) => isNum(num(it.earned)) && isNum(num(it.possible)) && num(it.possible) > 0);
        const extra = (c.items || []).filter((it) => isNum(num(it.earned)) && num(it.possible) === 0 && num(it.earned) > 0);
        const drop = Math.max(0, Math.floor(num(c.dropLowest) || 0));
        if (drop && items.length > drop) items = items.slice().sort((a, b) => num(a.earned) / num(a.possible) - num(b.earned) / num(b.possible)).slice(drop);
        const pg = pointsGrade(items.concat(extra));
        pct = pg.percent;
      }
      if (!isNum(pct)) return { name: c.name, weight: w, percent: null };
      wsum += w; acc += w * pct;
      return { name: c.name, weight: w, percent: pct };
    });
    return { percent: wsum > 0 ? acc / wsum : null, gradedWeight: wsum, totalWeight: total, weightsAddTo100: Math.abs(total - 100) < 1e-9, rows };
  }

  /** Score needed on a final (or any remaining component) of weight w% to reach a target, given the current grade on the
   *  rest of the course. Returns {needed, status}: status "ok", "impossible" (above maxScore), or "guaranteed" (<= 0). */
  function finalNeeded(current, finalWeight, target, maxScore) {
    const cur = num(current), w = num(finalWeight) / 100, t = num(target), mx = isNum(num(maxScore)) ? num(maxScore) : 100;
    if (![cur, w, t].every(isNum) || w <= 0 || w > 1) return { error: "Enter your current grade, the final's weight (1-100%), and your target." };
    const needed = (t - cur * (1 - w)) / w;
    const best = cur * (1 - w) + mx * w, worst = cur * (1 - w);
    if (needed > mx + 1e-9) return { needed, status: "impossible", best, worst };
    if (needed <= 0) return { needed, status: "guaranteed", best, worst };
    return { needed, status: "ok", best, worst };
  }

  /** Course grade for each possible final score (for a small table). */
  function finalOutcomes(current, finalWeight, scores) {
    const cur = num(current), w = num(finalWeight) / 100;
    return (scores || [100, 90, 80, 70, 60, 50]).map((s) => ({ final: s, course: cur * (1 - w) + s * w }));
  }

  /** Semester grade from components with weights: [{name, weight, grade}]. Blank grades are left out (weights renormalized). */
  function semesterGrade(parts) {
    return weightedGrade((parts || []).map((p) => ({ name: p.name, weight: p.weight, score: p.grade })));
  }

  // ---------------------------------------------------------------- SAT / ACT
  const SAT_SECTION = (v) => isNum(v) && v >= 200 && v <= 800 && v % 10 === 0;
  /** SAT superscore: the best Reading and Writing plus the best Math across sittings. attempts: [{rw, math, label}]. */
  function satSuperscore(attempts) {
    const ok = (attempts || []).map((a) => ({ label: a.label, rw: num(a.rw), math: num(a.math) })).filter((a) => SAT_SECTION(a.rw) && SAT_SECTION(a.math));
    if (!ok.length) return { error: "Enter section scores from 200 to 800 (multiples of 10)." };
    const bestRw = ok.reduce((b, a) => (a.rw > b.rw ? a : b)), bestM = ok.reduce((b, a) => (a.math > b.math ? a : b));
    const single = ok.reduce((b, a) => (a.rw + a.math > b.rw + b.math ? a : b));
    return { superscore: bestRw.rw + bestM.math, rw: bestRw.rw, math: bestM.math, rwFrom: bestRw.label, mathFrom: bestM.label, bestSingle: single.rw + single.math, gain: bestRw.rw + bestM.math - (single.rw + single.math) };
  }

  const ACT_SECTION = (v) => isNum(v) && v >= 1 && v <= 36 && Number.isInteger(v);
  // ACT rounds a composite average to the nearest whole number, with .5 rounding up.
  const actRound = (avg) => Math.floor(avg + 0.5 + 1e-9);

  /** ACT composite. version "enhanced" (tests from September 2025, and April 2025 online): English, Math, Reading.
   *  version "legacy" (earlier tests): English, Math, Reading, Science. */
  function actComposite(s, version) {
    const keys = version === "legacy" ? ["english", "math", "reading", "science"] : ["english", "math", "reading"];
    const vals = keys.map((k) => num(s && s[k]));
    if (!vals.every(ACT_SECTION)) return { error: "Enter whole-number section scores from 1 to 36 for " + keys.join(", ") + "." };
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { composite: actRound(avg), average: avg, sections: keys };
  }

  /** ACT superscore: best English, Math and Reading across test dates, averaged (ACT's rule for the enhanced test).
   *  Science, when entered, is reported as the best Science score but is not part of the composite. */
  function actSuperscore(attempts) {
    const ok = (attempts || []).map((a) => ({ label: a.label, english: num(a.english), math: num(a.math), reading: num(a.reading), science: num(a.science) }))
      .filter((a) => ACT_SECTION(a.english) && ACT_SECTION(a.math) && ACT_SECTION(a.reading));
    if (!ok.length) return { error: "Enter English, Math and Reading scores from 1 to 36 for at least one test." };
    const best = (k) => ok.filter((a) => ACT_SECTION(a[k])).reduce((b, a) => (!b || a[k] > b[k] ? a : b), null);
    const e = best("english"), m = best("math"), r = best("reading"), sc = best("science");
    const comp = actComposite({ english: e.english, math: m.math, reading: r.reading });
    const singles = ok.map((a) => actComposite(a).composite);
    return { superscore: comp.composite, average: comp.average, english: e.english, math: m.math, reading: r.reading, science: sc ? sc.science : null,
      from: { english: e.label, math: m.label, reading: r.label }, bestSingle: Math.max(...singles) };
  }

  return { VERSION, SCALES, LETTERS, PERCENT_CUTOFFS, DEFAULT_WEIGHTS, COURSE_TYPES, round2, percentToLetter, gradePoints, courseResult, gpa, termsGpa,
    cumulativeGpa, gpaNeeded, retakeGpa, projectGpa, pointsGrade, weightedGrade, finalNeeded, finalOutcomes, semesterGrade, satSuperscore, actComposite, actSuperscore };
});
