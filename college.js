/* College Score Goals: match practice scores to colleges' reported enrolled-student ranges.
   Data: U.S. Department of Education College Scorecard (see college-data.js meta).
   The percentage is an app estimate for planning, never an admission prediction. */
(function () {
  "use strict";
  const CD = window.COLLEGE_DATA || { colleges: [], meta: {}, concordance: { actToSat: {} } };
  const COLLEGES = CD.colleges;
  const BY_ID = new Map(COLLEGES.map((c) => [c.id, c]));
  const SAT_MIN = 400, SAT_MAX = 1600, ACT_MIN = 1, ACT_MAX = 36;

  const DEFAULTS = {
    v: 1, testType: "sat", sat: null, act: null, grade: "11", gpa: null, gpaScale: "4uw",
    rigor: { ap: 0, ib: 0, honors: 0, dual: 0 }, major: "", activities: [],
    firstGen: false, hardship: false, working: false, caregiving: false, circumstanceOther: "",
    applyPlan: "regular", appStrength: "average",
    saved: [], targetMode: "p75", customTarget: null, panelHeight: 470, query: "", filter: "all",
  };
  function cp() {
    if (!profile.college || typeof profile.college !== "object" || Array.isArray(profile.college)) profile.college = {};
    Object.keys(DEFAULTS).forEach((k) => { if (profile.college[k] === undefined) profile.college[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); });
    if (!Array.isArray(profile.college.saved)) profile.college.saved = [];
    if (!Array.isArray(profile.college.activities)) profile.college.activities = [];
    return profile.college;
  }
  function saveCollege() { try { saveProfile(); } catch (e) {} }
  function collegeSaveStatus() {
    return cloud.user ? "Your profile and saved colleges sync to your account on every device." : "Saved on this device. Sign in to sync your profile and college list across devices.";
  }

  // ---- Conversions (official ACT/College Board concordance, 2018) ----
  function satFromAct(act) {
    const table = CD.concordance.actToSat || {};
    let best = SAT_MIN;
    Object.keys(table).forEach((key) => { if (Number(key) <= Number(act)) best = Math.max(best, table[key]); });
    return best;
  }
  function actFromSat(sat) {
    const table = CD.concordance.actToSat || {};
    let best = 9;
    Object.keys(table).forEach((key) => { if (table[key] <= Number(sat)) best = Math.max(best, Number(key)); });
    return best;
  }

  // ---- Student score in each scale ----
  function studentScore(testType) {
    const c = cp();
    if (testType === "sat") return Number.isFinite(c.sat) && c.sat >= SAT_MIN ? c.sat : null;
    return Number.isFinite(c.act) && c.act >= ACT_MIN ? c.act : null;
  }
  function anyScore() {
    const c = cp();
    return { sat: studentScore("sat"), act: studentScore("act") };
  }
  function scoreFor(testType) {
    // Returns the student's score in this college's requested scale, using the
    // official concordance only when the student did not enter that test.
    const own = studentScore(testType);
    if (own != null) return { value: own, converted: false };
    const other = studentScore(testType === "sat" ? "act" : "sat");
    if (other == null) return null;
    return testType === "sat" ? { value: satFromAct(other), converted: true } : { value: actFromSat(other), converted: true };
  }

  // ---- College ranges ----
  function rangeFor(college, testType) {
    if (testType === "sat" && college.sr25 != null) return { lo: college.sr25, hi: college.sr75, mid: college.sr50, scale: "sat" };
    if (testType === "act" && college.ar25 != null) return { lo: college.ar25, hi: college.ar75, mid: college.ar50, scale: "act" };
    return null;
  }
  function displayTestFor(college) {
    const c = cp();
    const preferred = c.testType === "act" ? "act" : "sat";
    if (rangeFor(college, preferred)) return preferred;
    return rangeFor(college, "sat") ? "sat" : rangeFor(college, "act") ? "act" : preferred;
  }
  function midpoint(range) {
    if (range.mid != null) return Math.round((range.mid + range.hi) / 2);
    return Math.round((range.lo + range.hi) / 2);
  }
  function targetFor(college, range, testType) {
    const c = cp();
    if (c.targetMode === "custom" && Number.isFinite(c.customTarget) && c.customTarget > 0) return { value: c.customTarget, label: "Your custom target" };
    if (c.targetMode === "mid") return { value: midpoint(range), label: "Midpoint of the median and 75th percentile" };
    return { value: range.hi, label: "75th percentile of enrolled students" };
  }

  // ---- Estimate ----
  // Weighted GPAs add about +1.0 per AP/IB/dual class and +0.5 per honors class, averaged over every class taken.
  // Remove that average boost to get an unweighted-style GPA instead of shrinking the whole number.
  function weightBump(c) {
    const r = c.rigor || {};
    const boosted = (Number(r.ap) || 0) + (Number(r.ib) || 0) + (Number(r.dual) || 0) + 0.5 * (Number(r.honors) || 0);
    const courses = { "9": 6, "10": 12, "11": 18, "12": 24 }[c.grade] || 18;
    const bump = boosted > 0 ? boosted / courses : (c.gpaScale === "5w" ? 0.3 : 0.2);
    return Math.min(c.gpaScale === "5w" ? 1 : 0.6, bump);
  }
  function gpaOn4(c) {
    if (!Number.isFinite(c.gpa) || c.gpa <= 0) return null;
    if (c.gpaScale === "100") return Math.max(0, Math.min(4, (c.gpa - 60) / 10));
    if (c.gpaScale === "5w" || c.gpaScale === "4w") return Math.max(0, Math.min(4, c.gpa - weightBump(c)));
    return Math.max(0, Math.min(4, c.gpa));
  }
  function expectedGpa(admitPct) {
    if (admitPct <= 10) return 3.9;
    if (admitPct <= 20) return 3.8;
    if (admitPct <= 35) return 3.6;
    if (admitPct <= 55) return 3.4;
    if (admitPct <= 75) return 3.1;
    return 2.8;
  }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function activityStrength(c) {
    const list = Array.isArray(c.activities) ? c.activities : [];
    const leadership = list.filter((a) => a && a.leadership).length;
    const longTerm = list.filter((a) => a && Number(a.years) >= 2).length;
    return Math.min(0.3, 0.05 * list.length + 0.08 * leadership + 0.04 * longTerm);
  }
  function rigorStrength(c) {
    const r = c.rigor || {};
    return Math.min(0.4, 0.05 * (Number(r.ap) || 0) + 0.05 * (Number(r.ib) || 0) + 0.03 * (Number(r.honors) || 0) + 0.05 * (Number(r.dual) || 0));
  }
  function circumstanceStrength(c) {
    return (c.firstGen ? 0.06 : 0) + (c.hardship ? 0.04 : 0) + (c.working ? 0.03 : 0) + (c.caregiving ? 0.03 : 0);
  }

  function estimateCollege(college) {
    const c = cp();
    const testType = displayTestFor(college);
    const range = rangeFor(college, testType);
    const score = scoreFor(testType);
    const prior = clamp(college.adm / 100, 0.01, 0.95);
    const factors = [];
    let logit = Math.log(prior / (1 - prior));
    factors.push({ label: "College selectivity", detail: "Reported admit rate " + college.adm + "%. This is the starting point for every applicant.", effect: "base" });
    // Each factor records how much it moved the log-odds, so the card can show its effect in percentage points.
    let mark = logit;
    const addF = (f) => { if (f.delta == null) { f.delta = logit - mark; mark = logit; } factors.push(f); };

    let scoreDelta = 0;
    if (range && score) {
      const span = Math.max(1, range.hi - range.lo);
      const pos = (score.value - range.lo) / span;
      const z = clamp((pos - 0.5) * 2.2, -2.2, 2.2);
      scoreDelta = 0.85 * z;
      const where = score.value >= range.hi ? "at or above the 75th percentile" : score.value <= range.lo ? "below the 25th percentile" : Math.round(pos * 100) + "% of the way across the middle range";
      addF({ delta: scoreDelta, label: testType.toUpperCase() + " score", detail: "Your " + score.value + (score.converted ? " (converted from your other test)" : "") + " is " + where + " (" + range.lo + "–" + range.hi + ").", effect: scoreDelta > 0.15 ? "up" : scoreDelta < -0.15 ? "down" : "even" });
    } else {
      if (isTestBlind(college)) addF({ label: "Test policy", detail: "This university is test-blind, so SAT/ACT scores aren't considered. GPA, course rigor, and the rest of your application carry the decision.", effect: "context" });
      else addF({ label: testType.toUpperCase() + " score", detail: "Add your score to include test-position in the estimate.", effect: "missing" });
    }
    logit += scoreDelta; mark = logit;

    const gpa4 = gpaOn4(c);
    let gpaDelta = 0;
    if (gpa4 != null) {
      const bench = expectedGpa(college.adm);
      gpaDelta = 0.55 * clamp((gpa4 - bench) / 0.25, -2, 2);
      addF({ delta: gpaDelta, label: "GPA", detail: "Your " + gpa4.toFixed(2) + " on a 4.0 scale compared with an app benchmark of about " + bench.toFixed(1) + " for a college admitting " + college.adm + "%.", effect: gpaDelta > 0.12 ? "up" : gpaDelta < -0.12 ? "down" : "even" });
    } else {
      addF({ label: "GPA", detail: "Add your GPA to include academic performance in the estimate.", effect: "missing" });
    }
    logit += gpaDelta; mark = logit;

    // Personal context (reviewed by the AI tutor): colleges use it to explain a dip in grades,
    // not as a bonus, so it can offset part of a GPA shortfall, up to a cap set by its likely impact.
    const review = contextReviewFor(c);
    if (review) {
      const cap = ({ high: 0.45, moderate: 0.3, low: 0.12, none: 0 })[review.impact] || 0;
      const offset = gpaDelta < 0 ? Math.min(-gpaDelta * 0.6, cap) : 0;
      logit += offset;
      addF({ label: "Your context: " + review.category,
        detail: (offset > 0 ? "Counts as partly explaining your lower GPA (worth about +" + Math.round(offset * 100) / 100 + " log-odds here). " : "Your grades are already at or above this college's typical level, so it doesn't change the number, but it still helps your application read in context. ") +
          "Only counts if you tell the college about it.", effect: offset > 0.04 ? "up" : "context" });
    }

    const rigor = rigorStrength(c);
    logit += rigor;
    if (rigor > 0) addF({ label: "Course rigor", detail: "AP/IB/honors/dual-enrollment coursework adds a small readiness signal.", effect: "up" });

    const activity = activityStrength(c);
    logit += activity;
    if (activity > 0) addF({ label: "Activities", detail: "Sustained involvement and leadership add a small holistic signal.", effect: "up" });

    const circ = circumstanceStrength(c);
    logit += circ;
    if (circ > 0) addF({ label: "Context", detail: "First-generation status, work, caregiving, and hardship are treated as context, not as score boosts. Colleges review them individually.", effect: "context" });

    // Factors scale with selectivity: they matter more where the admit rate is low.
    const sel = 0.5 + (1 - clamp(college.adm / 100, 0, 1));

    // Residency: public universities admit in-state applicants at much higher rates.
    if (c.homeState && college.ctrl === "public") {
      if (c.homeState === college.st) { logit += 0.45 * sel; addF({ label: "In-state applicant", detail: "Public universities usually admit residents of their state at a higher rate than out-of-state applicants.", effect: "up" }); }
      else { logit -= 0.2 * sel; addF({ label: "Out-of-state applicant", detail: "Public universities usually hold out-of-state applicants to a higher bar than residents.", effect: "down" }); }
    }

    // Class rank adds to GPA: it shows where your grades sit at your own school.
    const RANK = { top5: [0.45, "Top 5% of your class"], top10: [0.3, "Top 10% of your class"], top25: [0.12, "Top 25% of your class"], top50: [-0.1, "Top half of your class"], below: [-0.35, "Lower half of your class"] };
    if (RANK[c.classRank]) {
      const [w, label] = RANK[c.classRank];
      logit += w * sel;
      addF({ label: "Class rank", detail: label + ". Rank shows how your grades compare at your own school, which colleges read alongside GPA.", effect: w > 0 ? "up" : "down" });
    }

    // Competitive majors at selective schools (computer science, engineering, nursing, business, data science).
    if (c.major && college.adm < 70 && /comput|\bcs\b|software|engineer|nursing|business|data sci|finance/i.test(c.major)) {
      logit -= 0.3 * sel;
      addF({ label: "Competitive major", detail: "\u201c" + c.major + "\u201d is often capped or more competitive than the college overall, so the estimate is lowered a little.", effect: "down" });
    } else if (c.major) addF({ label: "Intended major", detail: "Your major isn't one that's usually capped, so it doesn't change the estimate.", effect: "context" });

    // Application round: Early Decision (binding) helps much more than Early Action.
    const plan = c.applyPlan === "early" ? "ea" : c.applyPlan;
    if (plan === "ed" && college.ctrl === "private") {
      logit += 0.5;
      addF({ label: "Early Decision", detail: "Binding Early Decision usually has a noticeably higher admit rate at private colleges.", effect: "up" });
    } else if (plan === "ed" || plan === "ea") {
      logit += 0.12;
      addF({ label: "Early Action", detail: "Applying early (non-binding) gives a small edge at many colleges." + (plan === "ed" ? " Most public universities don't offer binding ED, so this counts as early action." : ""), effect: "up" });
    }

    // Hooks colleges openly weigh.
    if (c.athlete) { logit += 1.2; addF({ label: "Recruited athlete", detail: "Recruited athletes supported by a coach are admitted at far higher rates than other applicants.", effect: "up" }); }
    if (c.legacy && college.ctrl === "private") { logit += college.adm < 50 ? 0.3 : 0.1; addF({ label: "Legacy", detail: "Some private colleges give weight to a parent who attended. Many have dropped this, so the boost is small.", effect: "up" }); }
    if (c.appStrength === "strong") {
      logit += 0.18;
      addF({ label: "Essays and recommendations", detail: "You rated these strong. Self-reported holistic factors get a small, bounded weight; colleges review them in context.", effect: "up" });
    } else if (c.appStrength === "developing") {
      logit -= 0.18;
      addF({ label: "Essays and recommendations", detail: "You rated these as still developing. This is self-reported and gets a small, bounded weight.", effect: "down" });
    }

    const estimate = clamp(sigmoid(logit), 0.005, 0.97);
    factors.forEach((f) => { if (f.delta) f.pts = (estimate - clamp(sigmoid(logit - f.delta), 0.005, 0.97)) * 100; });
    let half = 0.06;
    if (!range || !score) half += 0.05;
    if (gpa4 == null) half += 0.04;
    if (c.grade === "9" || c.grade === "10") half += 0.03;
    if (RANK[c.classRank]) half -= 0.01;
    if (c.homeState) half -= 0.005;
    const lo = clamp(estimate - half, 0.005, 0.975);
    const hi = clamp(estimate + half, 0.005, 0.98);

    const selectivity = 1 - clamp(college.adm / 100, 0, 1);
    const zEst = Math.log(estimate / (1 - estimate));
    const borderline = Math.exp(-Math.pow(zEst / 1.15, 2));
    const waitlistRate = 0.01 + 0.06 * selectivity + 0.05 * borderline;
    let waitlist = clamp((1 - estimate) * waitlistRate, 0, 0.5);
    if (waitlist < 0.01) waitlist = 0;
    const deny = clamp(1 - estimate - waitlist, 0, 1);
    factors.push({
      label: "Waitlist estimate",
      detail: "About " + pct(waitlist) + " of the remaining chances are modeled as a waitlist offer: selective colleges use waitlists more, and borderline applicants are the most likely to receive one. Waitlist placement rarely converts to admission, and some colleges admit none off the waitlist.",
      effect: "context",
    });

    let conf = "low";
    if (range && score && gpa4 != null) conf = (c.grade === "12" || c.grade === "11") ? "high" : "medium";
    else if (range && score) conf = "medium";
    const confNotes = [];
    if (!range || !score) confNotes.push("add a test score and choose a college that reports ranges");
    if (gpa4 == null) confNotes.push("add your GPA");
    if (c.grade === "9" || c.grade === "10") confNotes.push("estimates are less certain before junior year");

    return {
      testType, range, score, estimate, lo, hi, waitlist, deny, factors, confidence: conf, confNotes,
      target: range ? targetFor(college, range, testType) : null,
      source: CD.meta,
    };
  }

  // California's public universities (UC and CSU) are test-blind: SAT/ACT scores aren't considered.
  function isTestBlind(college) { return !!college && college.st === "CA" && college.ctrl === "public"; }
  // National averages by grade, College Board SAT Suite of Assessments Annual Report, total group.
  // The PSATs share the SAT's score scale, so each grade compares with the test it usually takes.
  const NATIONAL_BY_GRADE = {
    "12": { mean: 1029, test: "SAT", note: "Class of 2025 SAT takers (2,004,965 students)" },
    "gap": { mean: 1029, test: "SAT", note: "Class of 2025 SAT takers (2,004,965 students)" },
    "11": { mean: 950, test: "PSAT/NMSQT", note: "2024–25 PSAT/NMSQT takers, mostly 11th graders" },
    "10": { mean: 904, test: "PSAT 10", note: "2024–25 PSAT 10 takers" },
    "9": { mean: 829, test: "PSAT 8/9", note: "2024–25 PSAT 8/9 takers" }
  };
  const OUTCOME_COLORS = { accept: "#22c55e", waitlist: "#3b82f6", deny: "#ef4444" };
  // Reach / target / likely / safety from the estimated accept chance.
  function fitOf(p) {
    return p < 0.25 ? { key: "reach", label: "Reach" } : p < 0.55 ? { key: "target", label: "Target" } : p < 0.85 ? { key: "likely", label: "Likely" } : { key: "safety", label: "Safety" };
  }
  function splitBar(est) {
    return '<div class="college-split" role="img" aria-label="Accept ' + pct(est.estimate) + ", waitlist " + pct(est.waitlist) + ", deny " + pct(est.deny) + '">' +
      '<span style="width:' + (est.estimate * 100).toFixed(1) + "%;background:" + OUTCOME_COLORS.accept + '"></span>' +
      '<span style="width:' + (est.waitlist * 100).toFixed(1) + "%;background:" + OUTCOME_COLORS.waitlist + '"></span>' +
      '<span style="width:' + (est.deny * 100).toFixed(1) + "%;background:" + OUTCOME_COLORS.deny + '"></span></div>';
  }
  // Re-run the estimate with one profile change, to show which improvement would move it most.
  function whatIf(college, change) {
    const c = cp(), saved = JSON.parse(JSON.stringify(c));
    try { change(c); return estimateCollege(college).estimate; } finally { Object.keys(c).forEach((k) => delete c[k]); Object.assign(c, saved); }
  }
  // A colored bar showing where your score sits in a college's middle-50% range (and beyond it).
  function rangeBarHtml(lo, hi, you, unit) {
    if (lo == null || hi == null) return "";
    const pad = (hi - lo) * 0.9, min = lo - pad, max = hi + pad, at = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
    return '<div class="chance-range" aria-label="' + unit + ' range ' + lo + ' to ' + hi + (you != null ? ', you ' + you : '') + '">' +
      '<div class="cr-track"><span class="cr-band" style="left:' + at(lo).toFixed(1) + '%;width:' + (at(hi) - at(lo)).toFixed(1) + '%"></span>' +
      (you != null ? '<span class="cr-you" style="left:' + at(you).toFixed(1) + '%"><b>' + you + '</b></span>' : '') + '</div>' +
      '<div class="cr-labels"><span style="left:' + at(lo).toFixed(1) + '%">' + lo + '</span><span style="left:' + at(hi).toFixed(1) + '%">' + hi + '</span></div></div>';
  }
  // Each factor with its effect on this college's estimate, in percentage points (largest first).
  function factorListHtml(est) {
    const fs = est.factors.filter((f) => f.pts != null && Math.abs(f.pts) >= 0.5).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
    if (!fs.length) return "";
    const fmt = (p) => (p > 0 ? "+" : "−") + (Math.abs(p) < 1 ? Math.abs(p).toFixed(1) : Math.round(Math.abs(p))) + "%";
    return '<div class="chance-factors"><div class="cg-k">What moves your estimate</div><ul>' +
      fs.map((f) => '<li class="' + (f.pts > 0 ? "f-up" : "f-down") + '" title="' + escapeHtml(f.detail || "") + '"><span>' + (f.pts > 0 ? "▲ " : "▼ ") + escapeHtml(f.label) + '</span><b>' + fmt(f.pts) + "</b></li>").join("") +
      '</ul><p class="chance-note" style="margin-top:6px">Each number is how much that one factor changes this estimate. They don\'t add up exactly, because each effect depends on the others.</p></div>';
  }
  function chanceCardHtml(college, est, c, gpa4) {
    const fit = fitOf(est.estimate), testType = est.testType;
    const up = est.factors.filter((f) => f.effect === "up").map((f) => f.label);
    const down = est.factors.filter((f) => f.effect === "down").map((f) => f.label);
    const boostScore = est.score && !isTestBlind(college) && est.range ? whatIf(college, (p) => { if (testType === "act") p.act = Math.min(36, (Number(p.act) || est.score.value) + 2); else p.sat = Math.min(1600, (Number(p.sat) || est.score.value) + 50); }) : null;
    const boostGpa = gpa4 != null ? whatIf(college, (p) => { const g = Number(p.gpa); p.gpa = Math.min(p.gpaScale === "100" ? 100 : p.gpaScale === "5w" ? 5 : 4.0, g + (p.gpaScale === "100" ? 5 : 0.2)); }) : null;
    const bench = expectedGpa(college.adm);
    const scoreWhere = est.range && est.score ? (est.score.value >= est.range.hi ? "Above their 75th percentile" : est.score.value <= est.range.lo ? "Below their 25th percentile" : "Inside their middle 50%") : isTestBlind(college) ? "Test-blind: scores aren't considered" : est.score ? "No score range reported" : "Add your score";
    const gain = (val) => val != null && val - est.estimate >= 0.005;
    const lever = (label, val) => !gain(val) ? "" : '<li><span>' + label + '</span><b class="up">' + pct(est.estimate) + " → " + pct(val) + "</b></li>";
    return '<li class="chance-item fitb-' + fit.key + '">' +
      '<div class="chance-head"><div><div class="chance-name">' + escapeHtml(college.n) + '</div><div class="chance-loc">' + escapeHtml(college.city || "") + (college.city ? ", " : "") + college.st + " · " + (college.ctrl === "public" ? "Public" : "Private") + (college.enr ? " · " + Number(college.enr).toLocaleString() + " undergrads" : "") + '</div></div><span class="fit fit-' + fit.key + '">' + fit.label + "</span></div>" +
      '<div class="chance-big"><span class="chance-pct">' + pct(est.estimate) + '</span><span class="chance-pct-l">chance of admission<br><span class="muted">likely range ' + pct(est.lo) + "–" + pct(est.hi) + " · " + est.confidence + " confidence</span></span></div>" +
      splitBar(est) +
      '<div class="chance-legend"><span><i style="background:' + OUTCOME_COLORS.accept + '"></i>Accept ' + pct(est.estimate) + '</span><span><i style="background:' + OUTCOME_COLORS.waitlist + '"></i>Waitlist ' + pct(est.waitlist) + '</span><span><i style="background:' + OUTCOME_COLORS.deny + '"></i>Deny ' + pct(est.deny) + "</span></div>" +
      '<div class="chance-grid">' +
        '<div class="cg-cell"><div class="cg-k">Admit rate</div><div class="cg-v">' + college.adm + '%</div></div>' +
        '<div class="cg-cell"><div class="cg-k">Your GPA vs typical</div><div class="cg-v">' + (gpa4 != null ? gpa4.toFixed(2) + ' <span class="muted">vs ~' + bench.toFixed(1) + "</span>" : '<span class="muted">add GPA</span>') + "</div></div>" +
        '<div class="cg-cell"><div class="cg-k">SAT middle 50%</div><div class="cg-v">' + (college.sr25 != null ? college.sr25 + "–" + college.sr75 : '<span class="muted">' + (isTestBlind(college) ? "test-blind" : "not reported") + "</span>") + "</div></div>" +
        '<div class="cg-cell"><div class="cg-k">ACT middle 50%</div><div class="cg-v">' + (college.ar25 != null ? college.ar25 + "–" + college.ar75 : '<span class="muted">' + (isTestBlind(college) ? "test-blind" : "not reported") + "</span>") + "</div></div>" +
      "</div>" +
      '<div class="chance-sub">' + scoreWhere + "</div>" +
      (est.range ? rangeBarHtml(est.range.lo, est.range.hi, est.score ? est.score.value : null, testType.toUpperCase()) : "") +
      factorListHtml(est) +
      ((boostScore != null || boostGpa != null) ? '<div class="chance-what"><div class="cg-k">What would raise it</div>' +
        (gain(boostScore) || gain(boostGpa) ? "<ul>" + lever(testType === "act" ? "+2 ACT points" : "+50 SAT points", boostScore) + lever("+" + (c.gpaScale === "100" ? "5" : "0.2") + " GPA", boostGpa) + "</ul>" :
          '<p class="chance-note" style="margin-top:4px">' + (est.estimate >= 0.85 ? "You're already well placed here. Strong essays and keeping your grades up matter most now." : "Small score or GPA changes barely move this one. It's very selective, so essays, activities, and recommendations carry the most weight.") + "</p>") + "</div>" : "") +
      '<div class="chance-actions"><button type="button" class="secondary" data-select="' + college.id + '">Full details</button>' +
      (college.url ? '<a class="chance-link" href="' + escapeHtml(/^https?:/.test(college.url) ? college.url : "https://" + college.url) + '" target="_blank" rel="noopener">Website ↗</a>' : "") +
      '<button type="button" class="ghost chance-remove" data-save="' + college.id + '" aria-label="Remove ' + escapeHtml(college.n) + '">Remove</button></div>' +
      "</li>";
  }
  function chancesHtml() {
    const c = cp();
    const saved = (c.saved || []).map((id) => BY_ID.get(Number(id))).filter(Boolean);
    const sort = c.chanceSort || "chance";
    const add = '<div class="chance-add"><label for="chanceAdd">Add a college</label><div class="chance-add-row"><input type="search" id="chanceAdd" placeholder="Name, state, or abbreviation (USF, UCLA, MIT)…" autocomplete="off" value="' + escapeHtml(c.chanceQuery || "") + '"></div><div id="chanceAddResults" class="chance-add-results">' + chanceAddResultsHtml(c.chanceQuery) + "</div></div>";
    let body;
    if (!saved.length) body = add + '<p class="chance-empty">Add colleges above and your chances at each one show up here, based on your GPA, test score, course rigor, activities, and application plan.</p>';
    else {
      const rows = saved.map((college) => ({ college, est: estimateCollege(college) }));
      rows.sort(sort === "name" ? (a, b) => a.college.n.localeCompare(b.college.n) : sort === "admit" ? (a, b) => a.college.adm - b.college.adm : (a, b) => a.est.estimate - b.est.estimate);
      const counts = { reach: 0, target: 0, likely: 0, safety: 0 };
      rows.forEach((r) => { counts[fitOf(r.est.estimate).key]++; });
      const gpa4 = gpaOn4(c), score = scoreFor(c.testType || "sat");
      const advice = counts.safety + counts.likely === 0 ? "Add at least two Likely or Safety schools so you have options you're confident about." :
        counts.reach > rows.length / 2 ? "More than half your list is a Reach. A balanced list usually has a few of each." :
        counts.target + counts.likely === 0 ? "Your list jumps from Reach to Safety. Add a few Target and Likely schools in between." :
        counts.reach === 0 ? "No Reach schools yet. Adding one or two can be worth it." : "Your list has a healthy mix. Keep a couple of schools in each group.";
      body = '<div class="chance-top"><div class="chance-mix">' + ["reach", "target", "likely", "safety"].map((k) => '<span class="fit fit-' + k + '"><b>' + counts[k] + "</b> " + k[0].toUpperCase() + k.slice(1) + "</span>").join("") + "</div>" +
        '<label class="chance-sort">Sort <select id="chanceSort"><option value="chance"' + (sort === "chance" ? " selected" : "") + '>Hardest first</option><option value="admit"' + (sort === "admit" ? " selected" : "") + '>Admit rate</option><option value="name"' + (sort === "name" ? " selected" : "") + ">Name</option></select></label></div>" +
        '<p class="chance-advice">' + advice + "</p>" + add +
        '<ul class="chance-list">' + rows.map(({ college, est }) => chanceCardHtml(college, est, c, gpa4)).join("") + "</ul>" +
        (gpa4 == null || !score ? '<p class="chance-note">Add your ' + (gpa4 == null ? "GPA" : "") + (gpa4 == null && !score ? " and " : "") + (!score ? "test score" : "") + " above to make these estimates sharper.</p>" : "") +
        '<p class="chance-note">Reach under 25%, Target 25–54%, Likely 55–84%, Safety 85% and up. App estimates from each college\'s admit rate and reported score ranges plus your profile, not official predictions.</p>';
    }
    return '<fieldset class="college-chances college-wide"><legend>Your chances</legend>' + body + "</fieldset>";
  }
  function chanceAddResultsHtml(query) {
    const q = String(query || "").trim();
    if (!q) return "";
    const c = cp();
    const list = COLLEGES.filter((x) => matches(x, q)).map((x, i) => [x, i]).sort((a, b) => (acronymRank(b[0], q) - acronymRank(a[0], q)) || a[1] - b[1]).map((p) => p[0]).slice(0, 6);
    if (!list.length) return '<p class="chance-note">No match in the ' + COLLEGES.length + " colleges in the app's College Scorecard data.</p>";
    return list.map((x) => { const isSaved = c.saved.includes(x.id); return '<button type="button" class="chance-add-item"' + (isSaved ? " disabled" : ' data-save="' + x.id + '" data-add-college="1"') + '><span><b>' + escapeHtml(x.n) + '</b><span class="muted"> · ' + x.st + " · admits " + x.adm + "%</span></span><span>" + (isSaved ? "Saved" : "+ Add") + "</span></button>"; }).join("");
  }

  // ---- Personal context review ----
  const IMPACT_KEYS = ["high", "moderate", "low", "none"];
  function contextReviewFor(c) {
    const r = c.contextReview, text = String(c.circumstanceOther || "").trim();
    return r && text && r.forText === text ? r : null;
  }
  // Used when the AI tutor can't be reached: a cautious keyword read with the same guidance.
  function localContextReview(text) {
    const t = text.toLowerCase();
    const medical = /brain|concussion|injur|surgery|hospital|illness|cancer|disease|medical|accident|chronic/.test(t);
    const mental = /depress|anxiety|mental|therapy|ptsd|grief|panic/.test(t);
    const family = /divorce|died|death|passed away|parent|sibling|foster|homeless|evict|caregiv/.test(t);
    const category = medical ? "Medical or injury" : mental ? "Mental health" : family ? "Family circumstances" : "Other circumstance";
    return { category, summary: "Read automatically from your note (the AI tutor wasn't available).", affectedYears: (t.match(/freshman|sophomore|junior|senior|9th|10th|11th|12th/) || [""])[0],
      impact: medical || mental || family ? "moderate" : "low", howCollegesView: "Admissions readers can consider a documented hardship when they look at grades from the affected time.", limitations: [], howToShare: [] };
  }
  const CONTEXT_LIMITS = [
    "Every college decides for itself how much weight context gets. There's no fixed bonus.",
    "Context explains a dip in grades; it doesn't replace grades or make up for missing coursework.",
    "It only counts if the college knows about it, so you have to tell them in your application.",
    "This app's adjustment is a rough estimate based on how colleges generally treat context."
  ];
  const CONTEXT_SHARE = [
    "Use the Common App “Additional Information” section (up to 650 words) to explain what happened, when, and how it affected school. Keep it factual and short.",
    "Ask your school counselor to mention it in their letter or school report. Colleges trust context that comes from the school.",
    "If your grades rose after the hard period, point to that upward trend. It shows recovery.",
    "Keep documentation (a doctor's or school note) in case a college asks, though most won't require it.",
    "If effects are ongoing, ask your counselor about testing accommodations through College Board (SSD) or ACT."
  ];
  async function reviewContext() {
    const c = cp(), text = String(c.circumstanceOther || "").trim(), box = $("contextReviewBox"), btn = $("btnReviewContext");
    if (!text) { if (box) box.innerHTML = '<p class="small muted">Write a short note first, then review it.</p>'; return; }
    if (btn) { btn.disabled = true; btn.textContent = "Reviewing…"; }
    let r;
    try {
      if (typeof aiChat !== "function") throw new Error("no ai");
      const raw = await aiChat([
        { role: "system", content: "You help a US high-school student understand how colleges may consider a personal circumstance they describe. Be factual, kind, and brief. Do not diagnose, give medical or legal advice, or promise outcomes. Return ONLY JSON with: category (short label such as Medical or injury, Mental health, Family circumstances, Financial hardship, Disability or learning difference, School change, Other), summary (one sentence restating what happened in neutral terms), affectedYears (which school years, or empty), likelyGradeImpact (exactly one of: high, moderate, low, none: how much this typically explains lower grades or fewer activities during that time), howCollegesView (one sentence on how admissions readers usually treat it), limitations (2-4 short strings: what this context can and cannot do), howToShare (3-5 short concrete steps to make sure colleges recognize it, such as the Common App Additional Information section, the counselor letter, documentation, an upward grade trend, testing accommodations if effects are ongoing)." },
        { role: "user", content: "My note: " + text + "\nGrade level: " + (c.grade || "unknown") + ". Other context I checked: " + ["firstGen", "hardship", "working", "caregiving"].filter((k) => c[k]).join(", ") }
      ], { teaching: true, kind: "context" });
      const m = String(raw || "").match(/\{[\s\S]*\}/); const v = JSON.parse(m ? m[0] : raw);
      const impact = IMPACT_KEYS.includes(String(v.likelyGradeImpact).toLowerCase()) ? String(v.likelyGradeImpact).toLowerCase() : "low";
      const list = (x) => Array.isArray(x) ? x.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()).slice(0, 5) : [];
      r = { category: String(v.category || "Other circumstance").slice(0, 60), summary: String(v.summary || "").slice(0, 300), affectedYears: String(v.affectedYears || "").slice(0, 60), impact,
        howCollegesView: String(v.howCollegesView || "").slice(0, 300), limitations: list(v.limitations), howToShare: list(v.howToShare), source: "ai" };
    } catch (e) { r = localContextReview(text); r.source = "local"; }
    r.forText = text; r.at = Date.now();
    c.contextReview = r; saveCollege(); renderCollegeScreen();
    try { showToast("Context reviewed and added to your estimates"); } catch (e) {}
  }
  function contextReviewHtml() {
    const c = cp(), text = String(c.circumstanceOther || "").trim(), r = c.contextReview;
    const btn = '<button type="button" class="secondary" id="btnReviewContext"' + (text ? "" : " disabled") + ">" + (r && r.forText === text ? "Review again" : "Review my context with AI") + "</button>";
    const privacy = '<p class="small muted">Your note is sent to the site\'s AI tutor only when you press the button. It\'s used to classify the situation; it isn\'t shared with any college.</p>';
    if (!r || !text) return '<div class="context-review" id="contextReviewBox">' + btn + privacy + "</div>";
    const stale = r.forText !== text;
    const impactWord = { high: "Likely to explain a big grade dip", moderate: "Can explain a moderate grade dip", low: "Small effect on how grades are read", none: "Usually doesn't change how grades are read" }[r.impact] || "";
    const li = (arr) => "<ul>" + arr.map((s) => "<li>" + escapeHtml(s) + "</li>").join("") + "</ul>";
    return '<div class="context-review" id="contextReviewBox">' +
      (stale ? '<p class="context-stale">You changed your note since the last review, so it isn\'t in the estimates. Review it again to include it.</p>' : "") +
      '<div class="context-card' + (stale ? " stale" : "") + '">' +
        '<div class="context-head"><span class="context-cat">' + escapeHtml(r.category) + '</span><span class="context-impact impact-' + r.impact + '">' + impactWord + "</span></div>" +
        (r.summary ? '<p class="context-sum">' + escapeHtml(r.summary) + (r.affectedYears ? ' <span class="muted">(' + escapeHtml(r.affectedYears) + ")</span>" : "") + "</p>" : "") +
        (r.howCollegesView ? '<p class="context-sum">' + escapeHtml(r.howCollegesView) + "</p>" : "") +
        '<p class="context-applied">' + (stale ? "Not applied." : "Applied to your chances: it can offset part of a GPA shortfall at each college, never more than a set limit.") + "</p>" +
        '<div class="context-cols"><div><h4>Limitations</h4>' + li(CONTEXT_LIMITS.concat(r.limitations || []).slice(0, 6)) + '</div><div><h4>How to make sure colleges recognize it</h4>' + li((r.howToShare && r.howToShare.length ? r.howToShare : []).concat(CONTEXT_SHARE).filter((s, i, a) => a.findIndex((x) => x.slice(0, 30) === s.slice(0, 30)) === i).slice(0, 6)) + "</div></div>" +
        (r.source === "local" ? '<p class="small muted">The AI tutor wasn\'t available, so this was read automatically from keywords. Try again later for a fuller review.</p>' : "") +
      "</div>" + btn + privacy + "</div>";
  }

  function pieHtml(est) {
    const R = 66, r = 40, C = 80;
    const slices = [
      { label: "Accept", value: est.estimate, color: OUTCOME_COLORS.accept },
      { label: "Waitlist", value: est.waitlist, color: OUTCOME_COLORS.waitlist },
      { label: "Deny", value: est.deny, color: OUTCOME_COLORS.deny },
    ].filter((x) => x.value > 0.0005);
    let angle = -Math.PI / 2;
    const paths = slices.map((x) => {
      const a0 = angle, a1 = angle + x.value * Math.PI * 2; angle = a1;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const px = (rad, a) => [(C + rad * Math.cos(a)).toFixed(2), (C + rad * Math.sin(a)).toFixed(2)];
      const [x0, y0] = px(R, a0), [x1, y1] = px(R, a1), [x2, y2] = px(r, a1), [x3, y3] = px(r, a0);
      const d = "M" + x0 + " " + y0 + " A" + R + " " + R + " 0 " + large + " 1 " + x1 + " " + y1 + " L" + x2 + " " + y2 + " A" + r + " " + r + " 0 " + large + " 0 " + x3 + " " + y3 + " Z";
      return '<path d="' + d + '" fill="' + x.color + '"></path>';
    }).join("");
    const legend = slices.map((x) => '<li><span class="pie-dot" style="background:' + x.color + '"></span><span><strong>' + x.label + "</strong> " + pct(x.value) + (x.label === "Accept" ? ' <span class="small muted">(' + pct(est.lo) + "–" + pct(est.hi) + ")</span>" : "") + "</span></li>").join("");
    return '<div class="college-pie-wrap"><svg class="college-pie" viewBox="0 0 160 160" width="150" height="150" role="img" aria-label="Estimated accept, waitlist, and deny shares">' +
      paths + '<text x="80" y="78" text-anchor="middle" class="pie-center">' + pct(est.estimate) + '</text><text x="80" y="96" text-anchor="middle" class="pie-center-sub">accept</text></svg>' +
      '<ul class="college-pie-legend">' + legend + "</ul></div>";
  }

  // ---- Reminder: unanswered questions never change the estimate ----
  function unansweredReminder() {
    let total = 0, attempts = 0;
    (profile.history || []).filter((r) => r.done && r.totalAnswered > 0 && Number.isFinite(r.total)).slice(0, 5).forEach((r) => {
      const skipped = Math.max(0, (r.total || 0) - (r.totalAnswered || 0));
      if (skipped) { total += skipped; attempts++; }
    });
    let active = 0;
    try {
      if (!state.done && Object.keys(state.answers || {}).length && state.plan) {
        const planned = Object.keys(state.plan).reduce((sum, key) => sum + ((state.plan[key].mods || []).reduce((a, m) => a + (m ? m.length : 0), 0)), 0);
        active = Math.max(0, planned - Object.keys(state.answers).length);
      }
    } catch (e) {}
    if (!total && !active) return "";
    const bits = [];
    if (active) bits.push(active + " unanswered in your current session");
    if (total) bits.push(total + " left blank across your last " + attempts + " finished attempt" + (attempts > 1 ? "s" : ""));
    return '<p class="small muted unanswered-note">Skipped questions never lower this estimate — it uses answered questions only. You still have ' + bits.join(" and ") + '. On test day, a blank and a wrong answer both score zero, so pace yourself to answer every question.</p>';
  }

  // ---- Search ----
  // Abbreviations built from each name's initials, skipping small words: "University of South
  // Florida" -> usf, "University of California-San Diego" -> ucsd and uc, "San Jose State
  // University" -> sjsu, "The University of Texas at Austin" -> uta and ut.
  const ACRONYM_SKIP = new Set(["of", "the", "at", "and", "in", "for", "&"]);
  function acronyms(college) {
    if (college._ac) return college._ac;
    const initials = (name) => name.replace(/[^A-Za-z\s-]/g, " ").split(/[\s-]+/).filter((w) => w && !ACRONYM_SKIP.has(w.toLowerCase())).map((w) => w[0].toLowerCase()).join("");
    const full = initials(college.n), base = initials(college.n.split("-")[0]);
    const set = new Set([full, base]);
    for (let i = 2; i < full.length; i++) set.add(full.slice(0, i));
    (college.aka || []).forEach((a) => set.add(String(a).toLowerCase().replace(/[^a-z]/g, "")));
    return (college._ac = [...set].filter((a) => a.length >= 2));
  }
  function acronymRank(college, query) {
    const q = String(query || "").trim().toLowerCase().replace(/[^a-z]/g, "");
    if (!q || /\s/.test(String(query).trim())) return 0;
    const ac = acronyms(college);
    return ac[0] === q || ac[1] === q ? 2 : ac.includes(q) ? 1 : 0;
  }
  function matches(college, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    if (acronymRank(college, q)) return true;
    const hay = [college.n, college.st, college.city, (college.aka || []).join(" ")].join(" ").toLowerCase();
    return q.split(/\s+/).every((part) => hay.includes(part));
  }
  function filteredColleges() {
    const c = cp();
    let list = COLLEGES.filter((college) => matches(college, c.query));
    if (c.filter === "public") list = list.filter((x) => x.ctrl === "public");
    if (c.filter === "private") list = list.filter((x) => x.ctrl === "private");
    if (c.filter === "saved") list = list.filter((x) => c.saved.includes(x.id));
    if (c.filter === "reach") list = list.filter((x) => { const e = estimateCollege(x); return e.range && e.score && e.score.value < e.range.lo; });
    // Exact abbreviation matches (USF, UCLA, MIT) first, then partial ones, then name matches.
    if (c.query) list = list.map((x, i) => [x, i]).sort((a, b) => (acronymRank(b[0], c.query) - acronymRank(a[0], c.query)) || a[1] - b[1]).map((p) => p[0]);
    return list;
  }
  let selectedId = null;
  function selectedCollege() { return selectedId == null ? null : BY_ID.get(selectedId) || null; }

  // ---- Groq chat for college planning ----
  let collegeChat = [];
  let collegeChatBusy = false;
  let collegeLastAnswer = "";
  function collegeContext(college, est) {
    const c = cp();
    const a = anyScore();
    return "You are a careful college-planning helper for a U.S. high school student. Give practical, calm guidance in under 160 words. Never promise admission and never invent statistics. Use only the data below; say when something is unknown. Write only what the student needs: no greetings, filler, or restating the question; short sentences; plain characters for any math.\n" +
      "Student: grade " + (c.grade || "unknown") + ", GPA " + (c.gpa != null ? c.gpa + " (" + c.gpaScale + " scale)" : "not entered") +
      ", SAT " + (a.sat != null ? a.sat : "not entered") + ", ACT " + (a.act != null ? a.act : "not entered") +
      ", major interest " + (c.major || "undecided") + ". Activities: " + ((c.activities || []).map((x) => x.name).filter(Boolean).join(", ") || "none entered") + "." +
      "\nCollege: " + college.n + " (" + college.city + ", " + college.st + "), admit rate " + college.adm + "%, undergraduate enrollment " + college.enr + "." +
      (est.range ? " Reported enrolled-student " + est.testType.toUpperCase() + " range: " + est.range.lo + "-" + est.range.hi + "." : " No test range reported.") +
      "\nApp estimate: " + Math.round(est.estimate * 100) + "% (range " + Math.round(est.lo * 100) + "-" + Math.round(est.hi * 100) + "%). Remind the student this is an unofficial planning estimate.";
  }
  async function askCollegeGroq(college, est, question, statusEl, replyEl) {
    if (collegeChatBusy) return;
    collegeChatBusy = true;
    statusEl.textContent = "Asking the Groq tutor…";
    try { renderAiText(replyEl, ""); } catch (e) { replyEl.textContent = ""; }
    const synthetic = { id: "college-" + college.id, domain: "College planning", skill: college.n, q: "College planning: " + college.n, choices: [""], ans: 0, exp: "", passage: "" };
    try {
      const answer = await aiChat([
        { role: "system", content: collegeContext(college, est) },
        ...collegeChat.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ]);
      collegeChat.push({ role: "user", content: question }, { role: "assistant", content: answer });
      collegeLastAnswer = answer;
      try { renderAiText(replyEl, answer); } catch (e) { replyEl.textContent = answer; }
      const saved = await recordTutorHelp(synthetic, question, answer, "college-planning", "complete");
      statusEl.textContent = cloud.user ? (saved ? "Saved to Help history." : "Answer shown; it will retry saving on your next request.") : "Sign in to save college questions in Help history.";
    } catch (e) {
      replyEl.textContent = aiErrorText(e);
      statusEl.textContent = "Could not reach the tutor. You can still use the numbers above.";
      recordTutorHelp(synthetic, question, replyEl.textContent, "college-planning", "failed");
    }
    collegeChatBusy = false;
  }

  // ---- Rendering ----
  function pct(x) { return Math.round(x * 100) + "%"; }
  function collegeUrl(college) {
    const raw = String(college.url || "").trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw) return "https://" + raw.replace(/^\/+/, "");
    return "https://collegescorecard.ed.gov/school/?" + college.id;
  }
  function rangeText(college) { return college.sr25 != null ? college.sr25 + "–" + college.sr75 : "not reported"; }
  function actText(college) { return college.ar25 != null ? college.ar25 + "–" + college.ar75 : "not reported"; }
  function effectTag(effect) {
    const map = { up: ["↑", "college-effect-up"], down: ["↓", "college-effect-down"], even: ["→", "college-effect-even"], base: ["•", "college-effect-even"], missing: ["?", "college-effect-missing"], context: ["i", "college-effect-even"] };
    const item = map[effect] || map.even;
    return '<span class="college-effect ' + item[1] + '" aria-hidden="true">' + item[0] + '</span>';
  }
  function scoreLine(college) {
    const est = estimateCollege(college);
    if (!est.range) return '<span class="college-muted">No SAT/ACT range reported</span>';
    if (!est.score) return '<span class="college-muted">Enter your score to compare</span>';
    const pos = clamp((est.score.value - est.range.lo) / Math.max(1, est.range.hi - est.range.lo), 0, 1);
    const above = est.score.value - est.range.hi;
    const below = est.score.value - est.range.lo;
    const note = above >= 0 ? "+" + above + " above the 75th" : below < 0 ? below + " below the 25th" : pct(pos) + " across the range";
    return '<span class="college-position' + (above >= 0 ? " good" : below < 0 ? " low" : "") + '">' + escapeHtml(note) + "</span>";
  }

  function savedPanelHtml() {
    const c = cp();
    const saved = (c.saved || []).map((id) => BY_ID.get(Number(id))).filter(Boolean);
    if (!saved.length) return '<aside class="college-saved-panel" id="collegeSavedPanel"><h3>Saved colleges</h3><p class="small muted">No saved colleges yet. Search on the left and tap ☆ to add schools here for quick access and comparison.</p></aside>';
    return '<aside class="college-saved-panel" id="collegeSavedPanel"><h3>Saved colleges <span class="small muted">(' + saved.length + ')</span></h3><ul class="college-saved-list">' +
      saved.map((x) => {
        const est = estimateCollege(x);
        const where = est.range && est.score ? (est.score.value >= est.range.hi ? "above 75th" : est.score.value <= est.range.lo ? "below 25th" : "mid 50%") : isTestBlind(x) ? "test-blind" : est.score ? "no range" : "add score";
        const fit = fitOf(est.estimate);
        return '<li class="cs-row"><button type="button" class="college-saved-item' + (x.id === selectedId ? " current" : "") + '" data-select="' + x.id + '" title="' + escapeHtml(x.n) + ": " + x.st + ", admits " + x.adm + "%, " + where + '">' +
          '<span class="cs-name">' + escapeHtml(x.n) + '</span><span class="cs-meta">' + x.st + " · " + Math.round(x.adm) + "% admit · " + where + '</span>' +
          '<span class="cs-est fit-' + fit.key + '">' + pct(est.estimate) + "</span></button>" +
          '<button type="button" class="ghost cs-remove" data-save="' + x.id + '" title="Remove from saved" aria-label="Remove ' + escapeHtml(x.n) + '">✕</button></li>';
      }).join("") + '</ul><p class="small muted">Also shown in the home comparison and the compare table below.</p></aside>';
  }
  function profileHtml() {
    const c = cp();
    const pred = (() => { try { return predictScores(); } catch (e) { return { sat: {}, act: {} }; } })();
    const predSat = pred.sat && pred.sat.total ? pred.sat.total.point : null;
    const predAct = pred.act && pred.act.composite ? pred.act.composite.point : null;
    const activityRows = (c.activities || []).map((a, i) => '<div class="college-activity-row" data-i="' + i + '">' +
      '<input type="text" data-act="name" placeholder="Activity (e.g., robotics team)" maxlength="80" value="' + escapeHtml(a.name || "") + '">' +
      '<select data-act="type">' + ["", "Leadership", "Award", "Job", "Volunteer", "Family responsibility", "Club/Sport", "Other"].map((t) => '<option value="' + t + '"' + (a.type === t ? " selected" : "") + ">" + (t || "Type") + "</option>").join("") + "</select>" +
      '<input type="number" data-act="years" min="0" max="7" step="1" placeholder="Yrs" value="' + (a.years != null ? a.years : "") + '">' +
      '<input type="number" data-act="hours" min="0" max="80" step="1" placeholder="Hrs/wk" value="' + (a.hours != null ? a.hours : "") + '">' +
      '<label class="college-check"><input type="checkbox" data-act="leadership"' + (a.leadership ? " checked" : "") + "> Lead</label>" +
      '<button type="button" class="ghost" data-act="remove" aria-label="Remove activity">✕</button></div>').join("");
    return '<details class="college-card college-profile" open>' +
      '<summary><strong>Your profile</strong><span class="small muted"> ' + collegeSaveStatus() + "</span></summary>" +
      '<div id="collegeProfileHero" class="college-hero"></div>' +
      '<div class="college-profile-wrap"><div class="college-profile-grid">' +
      '<fieldset class="college-band college-band-scores"><legend>Test scores</legend>' +
      '<label>Primary test <select id="collegeTestType"><option value="sat"' + (c.testType === "sat" ? " selected" : "") + '>SAT</option><option value="act"' + (c.testType === "act" ? " selected" : "") + ">ACT</option></select></label>" +
      '<label>SAT total (400–1600) <input type="number" id="collegeSat" min="400" max="1600" step="10" value="' + (c.sat != null ? c.sat : "") + '" placeholder="e.g., 1350"></label>' +
      '<label>ACT composite (1–36) <input type="number" id="collegeAct" min="1" max="36" step="1" value="' + (c.act != null ? c.act : "") + '" placeholder="e.g., 30"></label>' +
      (predSat || predAct ? '<button type="button" class="secondary" id="collegeUsePredicted">Use predicted' + (predSat ? " (SAT " + predSat + ")" : predAct ? " (ACT " + predAct + ")" : "") + "</button>" : "") +
      '<p class="small muted">Enter your best official or practice score. Predicted scores come from your practice attempts and are estimates.</p></fieldset>' +
      '<fieldset class="college-band college-band-acad"><legend>Academics</legend>' +
      '<label>Grade level <select id="collegeGrade">' + [["9", "9th"], ["10", "10th"], ["11", "11th"], ["12", "12th"], ["gap", "Gap year / other"]].map(([v, t]) => '<option value="' + v + '"' + (c.grade === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" +
      '<div class="college-gpa-pair">' +
      '<label>GPA <input type="number" id="collegeGpa" min="0" max="100" step="0.01" value="' + (c.gpa != null ? c.gpa : "") + '" placeholder="e.g., 3.85"></label>' +
      '<label>GPA scale <select id="collegeGpaScale">' + [["4uw", "4.0 unweighted"], ["4w", "4.0 weighted"], ["5w", "5.0 weighted"], ["100", "100-point"]].map(([v, t]) => '<option value="' + v + '"' + (c.gpaScale === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" +
      '</div>' +
      '<label>Class rank <select id="collegeClassRank">' + [["", "Not ranked / don't know"], ["top5", "Top 5%"], ["top10", "Top 10%"], ["top25", "Top 25%"], ["top50", "Top 50%"], ["below", "Lower half"]].map(([v, t]) => '<option value="' + v + '"' + ((c.classRank || "") === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" +
      '<label>Home state <select id="collegeHomeState"><option value="">Choose…</option>' + "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" ").map((s) => '<option value="' + s + '"' + (c.homeState === s ? " selected" : "") + ">" + s + "</option>").join("") + "</select></label>" +
      '<label>Intended major <input type="text" id="collegeMajor" maxlength="80" value="' + escapeHtml(c.major || "") + '" placeholder="e.g., Computer science"></label>' +
      '<label>Application plan <select id="collegeApplyPlan">' + [["regular", "Regular decision"], ["ea", "Early Action (non-binding)"], ["ed", "Early Decision (binding)"]].map(([v, t]) => '<option value="' + v + '"' + ((c.applyPlan === "early" ? "ea" : c.applyPlan || "regular") === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" +
      '<label>Essays &amp; recs (self-rated) <select id="collegeAppStrength"><option value="strong"' + (c.appStrength === "strong" ? " selected" : "") + '>Strong</option><option value="average"' + (c.appStrength !== "strong" && c.appStrength !== "developing" ? " selected" : "") + '>Average</option><option value="developing"' + (c.appStrength === "developing" ? " selected" : "") + '>Still developing</option></select></label>' +
      '<div class="college-rigor"><span>Course rigor (number of AP, IB, honors, dual-enrollment courses)</span>' +
      ["ap", "ib", "honors", "dual"].map((k) => '<label>' + ({ ap: "AP", ib: "IB", honors: "Honors", dual: "Dual" })[k] + ' <input type="number" min="0" max="40" step="1" data-rigor="' + k + '" value="' + (Number(c.rigor[k]) || 0) + '"></label>').join("") + "</div></fieldset>" +
      chancesHtml() +
      '<fieldset class="college-wide"><legend>Activities and circumstances</legend>' +
      '<div class="college-activities" id="collegeActivities">' + activityRows + "</div>" +
      '<button type="button" class="secondary" id="collegeAddActivity">+ Add activity</button>' +
      '<div class="college-checks">' +
      '<label class="college-check"><input type="checkbox" id="collegeAthlete"' + (c.athlete ? " checked" : "") + "> Recruited athlete (a coach is supporting you)</label>" +
      '<label class="college-check"><input type="checkbox" id="collegeLegacy"' + (c.legacy ? " checked" : "") + "> Parent attended (legacy)</label>" +
      '<label class="college-check"><input type="checkbox" id="collegeFirstGen"' + (c.firstGen ? " checked" : "") + "> First-generation college student</label>" +
      '<label class="college-check"><input type="checkbox" id="collegeHardship"' + (c.hardship ? " checked" : "") + "> Financial hardship</label>" +
      '<label class="college-check"><input type="checkbox" id="collegeWorking"' + (c.working ? " checked" : "") + "> Working during school</label>" +
      '<label class="college-check"><input type="checkbox" id="collegeCaregiving"' + (c.caregiving ? " checked" : "") + "> Caregiving responsibilities</label></div>" +
      '<label>Other context (optional) <textarea id="collegeOther" rows="2" maxlength="500" placeholder="Anything else colleges should know">' + escapeHtml(c.circumstanceOther || "") + "</textarea></label>" + contextReviewHtml() +
      "</fieldset></div>" + savedPanelHtml() + "</div>" + unansweredReminder() + "</details>";
  }

  function resultsHtml() {
    const c = cp();
    const list = filteredColleges();
    const head = '<div class="college-list-head"><strong>' + list.length + " college" + (list.length === 1 ? "" : "s") + '</strong><span class="small muted">SAT/ACT ranges are for enrolled students (College Scorecard)</span></div>';
    if (!list.length) return head + '<p class="college-muted">No colleges match. Try a different name, state, or filter.</p>';
    const shown = list.slice(0, 40);
    return head + '<div class="college-list">' + shown.map((college) => {
      const saved = c.saved.includes(college.id);
      const selected = college.id === selectedId;
      return '<article class="college-row' + (selected ? " selected" : "") + '" data-college="' + college.id + '">' +
        '<button type="button" class="college-row-main" data-select="' + college.id + '">' +
        '<span class="college-name">' + escapeHtml(college.n) + '</span>' +
        '<span class="small muted">' + escapeHtml(college.city) + ", " + college.st + " · " + college.ctrl + " · admits " + college.adm + "%" + (college.enr ? " · " + college.enr.toLocaleString() + " undergrads" : "") + "</span>" +
        '<span class="college-ranges">SAT ' + rangeText(college) + " · ACT " + actText(college) + " · " + scoreLine(college) + "</span></button>" +
        '<button type="button" class="secondary college-save" data-save="' + college.id + '" aria-pressed="' + saved + '" title="' + (saved ? "Remove from saved" : "Save college") + '">' + (saved ? "★" : "☆") + "</button></article>";
    }).join("") + "</div>" + (list.length > 40 ? '<p class="small muted">Showing the first 40 matches. Narrow your search to see more.</p>' : "");
  }

  function detailHtml() {
    const college = selectedCollege();
    if (!college) return '<div class="college-card college-detail"><h3>Pick a college</h3><p class="small muted">Search on the left, then choose a college to see score ranges, a target, and an unofficial estimate.</p></div>';
    const c = cp();
    const est = estimateCollege(college);
    const target = est.target;
    const score = est.score;
    const range = est.range;
    const saved = c.saved.includes(college.id);
    const money = (n) => n == null ? "—" : "$" + Number(n).toLocaleString();
    let targetBlock = '<p class="small muted">This college has not reported ' + (est.testType === "sat" ? "SAT" : "ACT") + " ranges to the Department of Education. The estimate uses selectivity" + (gpaOn4(c) != null ? " and GPA" : "") + " only.</p>";
    if (range && score && target) {
      const pos = clamp((score.value - range.lo) / Math.max(1, range.hi - range.lo), 0, 1);
      const progress = target.value > range.lo ? clamp((score.value - range.lo) / (target.value - range.lo), 0, 1) : 1;
      const diff = score.value - target.value;
      targetBlock =
        '<div class="college-bar" role="img" aria-label="Your score position in the college range">' +
        '<div class="college-bar-track"><span class="college-bar-fill" style="width:' + Math.round(pos * 100) + '%"></span>' +
        '<span class="college-bar-marker" style="left:' + Math.round(pos * 100) + '%"></span></div>' +
        '<div class="college-bar-labels"><span>25th: ' + range.lo + '</span><span>75th: ' + range.hi + '</span></div></div>' +
        '<p><strong>' + (diff >= 0 ? diff + " points above your target" : Math.abs(diff) + " points below your target") + '</strong> (' + target.label + ': ' + target.value + "). You are " + Math.round(progress * 100) + "% of the way from the 25th percentile to that target.</p>" +
        '<div class="college-equation-row"><code>score position = (' + score.value + ' - ' + range.lo + ') / (' + range.hi + ' - ' + range.lo + ') = ' + (Math.round(pos * 100) / 100).toFixed(2) + '</code></div>' +
        (score.converted ? '<p class="small muted">Your score was converted with the official ACT/College Board concordance table because this college reports the other test.</p>' : "");
    }
    const factorHtml = est.factors.map((f) => '<li>' + effectTag(f.effect) + '<div><strong>' + escapeHtml(f.label) + '.</strong> <span class="small">' + escapeHtml(f.detail) + "</span></div></li>").join("");
    const level = est.estimate >= 0.75 ? "likely range" : est.estimate >= 0.4 ? "competitive range" : est.estimate >= 0.15 ? "reach range" : "far reach";
    return '<div class="college-card college-detail" id="collegeDetail">' +
      '<div class="college-detail-head"><div><h3>' + escapeHtml(college.n) + '</h3><p class="small muted">' + escapeHtml(college.city) + ", " + college.st + " · " + college.ctrl + ' · <a href="' + escapeHtml(collegeUrl(college)) + '" target="_blank" rel="noopener">official site</a> · <a href="https://collegescorecard.ed.gov/school/?' + college.id + '" target="_blank" rel="noopener">source data</a></p></div>' +
      '<button type="button" class="secondary" data-save="' + college.id + '" aria-pressed="' + saved + '">' + (saved ? "★ Saved" : "☆ Save") + "</button></div>" +
      '<div class="college-stats">' +
      '<div><span class="college-stat-num">' + college.adm + '%</span><span class="small muted">reporting admit rate</span></div>' +
      '<div><span class="college-stat-num">' + rangeText(college) + '</span><span class="small muted">SAT EBRW+Math, enrolled</span></div>' +
      '<div><span class="college-stat-num">' + actText(college) + '</span><span class="small muted">ACT composite, enrolled</span></div>' +
      '<div><span class="college-stat-num">' + (range && range.mid != null ? range.mid : "—") + '</span><span class="small muted">reported median (' + est.testType.toUpperCase() + ')</span></div>' +
      '<div><span class="college-stat-num">' + money(college.net) + '</span><span class="small muted">average annual net price</span></div>' +
      '<div><span class="college-stat-num">' + money(college.tuIn) + (college.ctrl === "public" && college.tuOut != null ? ' / ' + money(college.tuOut) : '') + '</span><span class="small muted">annual tuition' + (college.ctrl === "public" ? ' (in / out of state)' : '') + '</span></div></div>' +
      '<div class="college-target"><div class="college-target-head"><strong>Score goal</strong><span class="small muted">Default: 75th percentile (adjustable)</span></div>' +
      '<div class="college-target-btns" role="group" aria-label="Target score">' +
      '<button type="button" class="secondary' + (c.targetMode === "p75" ? " on" : "") + '" data-target="p75">75th percentile</button>' +
      '<button type="button" class="secondary' + (c.targetMode === "mid" ? " on" : "") + '" data-target="mid">Above midrange</button>' +
      '<button type="button" class="secondary' + (c.targetMode === "custom" ? " on" : "") + '" data-target="custom">Custom</button>' +
      (c.targetMode === "custom" ? '<input type="number" id="collegeCustomTarget" min="' + SAT_MIN + '" max="' + SAT_MAX + '" step="10" value="' + (c.customTarget != null ? c.customTarget : "") + '" aria-label="Custom target score">' : "") +
      "</div>" + targetBlock + "</div>" +
      '<div class="college-estimate">' + pieHtml(est) +
      '<div><strong>Estimated outcomes</strong> <span class="college-conf college-conf-' + est.confidence + '">' + est.confidence + ' confidence</span> <span class="small muted">(' + level + ')</span>' +
      '<p class="small muted">Accept, waitlist, and deny shares come from an app model using the factors below. The accept range is ' + pct(est.lo) + ' – ' + pct(est.hi) + '. Waitlist placement is an estimate: it is more common at selective colleges and for borderline applicants, but rarely converts to admission, and some colleges admit none off the waitlist. This is not an admission decision or a guarantee.</p>' +
      (est.confNotes.length ? '<p class="small muted">Improve accuracy: ' + escapeHtml(est.confNotes.join('; ')) + '.</p>' : '') + '</div></div>' +
      '<div class="college-equation-row"><code>estimate = sigmoid(' + "selectivity log-odds" + ' + score + GPA + rigor + activities + context)</code></div>' +
      '<p class="small muted">Sources: ' + escapeHtml(CD.meta.source || "College Scorecard") + " (" + escapeHtml(CD.meta.release || "") + "). Admit rate and ranges describe enrolled students and are the most recent figures the college reported to the U.S. Department of Education. Verify current test policies with the college.</p></details>" +
      '<div class="college-groq"><label for="collegeAsk">Ask the Groq tutor about this college plan</label>' +
      '<div class="college-groq-row"><input type="text" id="collegeAsk" maxlength="300" placeholder="e.g., What should I do this semester to improve?"><button type="button" id="collegeAskBtn">Ask</button></div>' +
      '<p class="small muted" id="collegeAskStatus"></p><div class="college-ask-reply" id="collegeAskReply" aria-live="polite"></div></div>' +
      '<input type="hidden" id="collegeSelected" value="' + college.id + '">' +
      '<div class="college-resize" id="collegeResize" role="separator" aria-label="Drag to resize this panel" tabindex="0" title="Drag to resize this panel (arrow keys also work)"></div>' +
      "</div>";
  }

  function compareHtml() {
    const c = cp();
    const saved = c.saved.map((id) => BY_ID.get(id)).filter(Boolean);
    if (saved.length < 2) return "";
    const cells = saved.map((college) => { const est = estimateCollege(college); return { college, est }; });
    return '<div class="college-card college-compare"><h3>Saved colleges (' + saved.length + ")</h3><div class=\"college-compare-scroll\"><table><thead><tr><th>College</th>" +
      cells.map((x) => "<th>" + escapeHtml(x.college.n) + "</th>").join("") + "</tr></thead><tbody>" +
      "<tr><td>Admit rate</td>" + cells.map((x) => "<td>" + x.college.adm + "%</td>").join("") + "</tr>" +
      "<tr><td>SAT enrolled</td>" + cells.map((x) => "<td>" + rangeText(x.college) + "</td>").join("") + "</tr>" +
      "<tr><td>ACT enrolled</td>" + cells.map((x) => "<td>" + actText(x.college) + "</td>").join("") + "</tr>" +
      "<tr><td>Average net price</td>" + cells.map((x) => "<td>" + (x.college.net == null ? "—" : "$" + Number(x.college.net).toLocaleString()) + "</td>").join("") + "</tr>" +
      "<tr><td>Your position</td>" + cells.map((x) => "<td>" + scoreLine(x.college) + "</td>").join("") + "</tr>" +
      "<tr><td>Estimated range</td>" + cells.map((x) => "<td>" + pct(x.est.lo) + " – " + pct(x.est.hi) + "</td>").join("") + "</tr>" +
      "</tbody></table></div>" +
      '<button type="button" class="secondary" id="collegeClearSaved">Clear saved colleges</button></div>';
  }

  function renderCollegeScreen() {
    const host = $("screen-college");
    if (!host) return;
    const c = cp();
    host.innerHTML =
      '<header class="st-head college-head"><div class="st-kicker">College score goals · data from the U.S. Department of Education</div>' +
      '<h1>How do your scores compare?</h1>' +
      '<p class="small muted">Search 300+ popular four-year colleges, set a score goal, and keep your profile in your account. Ranges describe enrolled students. The percentage is an unofficial planning estimate, not an admission prediction.</p>' +
      '<div class="college-top-actions"><button type="button" class="secondary" id="collegeBack">← Back</button><span class="small muted">' + escapeHtml(CD.meta.source || "") + " · release " + escapeHtml(CD.meta.release || "") + "</span></div></header>" +
      profileHtml() +
      '<div class="college-layout">' +
      '<section class="college-find"><h3>Find colleges</h3>' +
      '<div class="college-search"><label for="collegeQuery">Search by name, abbreviation, or state</label><input type="search" id="collegeQuery" value="' + escapeHtml(c.query || "") + '" placeholder="e.g., UCLA, engineering, or Ohio" autocomplete="off"></div>' +
      '<div class="college-filters" role="group" aria-label="College filters"><button type="button" class="secondary' + (c.filter === "all" ? " on" : "") + '" data-filter="all">All</button><button type="button" class="secondary' + (c.filter === "public" ? " on" : "") + '" data-filter="public">Public</button><button type="button" class="secondary' + (c.filter === "private" ? " on" : "") + '" data-filter="private">Private</button><button type="button" class="secondary' + (c.filter === "saved" ? " on" : "") + '" data-filter="saved">Saved (' + c.saved.length + ")</button></div>" +
      '<div id="collegeResults">' + resultsHtml() + "</div></section>" +
      '<div id="collegeDetailHost"' + (selectedCollege() ? ' class="as-popup" role="dialog" aria-modal="true" aria-label="' + escapeHtml(selectedCollege().n) + '"><div class="cpop-box"><button type="button" class="cpop-close" data-close-detail aria-label="Close">✕</button>' + detailHtml() + "</div>" : ">") + "</div>" +
      "</div>" + compareHtml() +
      '<p class="small muted college-foot">College data: <a href="' + escapeHtml(CD.meta.sourceUrl || "https://collegescorecard.ed.gov/data/") + '" target="_blank" rel="noopener">College Scorecard</a>, ' + escapeHtml(CD.meta.release || "") + ". " + escapeHtml(CD.meta.note || "") + ' The admissions estimate is an original app model and is not affiliated with any college. <a href="https://www.act.org/content/act/en/products-and-services/the-act/scores/act-sat-concordance.html" target="_blank" rel="noopener">Official ACT/SAT concordance</a>.</p>';
    wireCollege();
    applyPanelSize();
  }

  let detailReturnsHome = false;
  function selectCollege(id) { selectedId = id; document.body.classList.toggle("cpop-open", id != null); try { renderCollegeScreen(); } catch (e) {} }
  function closeDetail() {
    selectedId = null; document.body.classList.remove("cpop-open");
    if (detailReturnsHome) { detailReturnsHome = false; closeCollege(); } else { try { renderCollegeScreen(); } catch (e) {} }
  }
  // Open a college's details as a popup from anywhere (e.g., the home screen's college tabs).
  function openCollegeDetail(id) {
    detailReturnsHome = state.view !== "college";
    openCollege("");
    selectCollege(Number(id));
  }
  function toggleSaved(id) {
    const c = cp();
    const i = c.saved.indexOf(Number(id));
    if (i >= 0) c.saved.splice(i, 1); else c.saved.push(Number(id));
    saveCollege(); renderCollegeScreen();
  }

  function rerenderResults() {
    const box = $("collegeResults");
    if (box) box.innerHTML = resultsHtml();
  }

  function applyPanelSize() {
    const c = cp();
    const detail = $("collegeDetail");
    if (detail) detail.style.setProperty("--college-panel-height", Math.max(240, Math.min(1400, Number(c.panelHeight) || 470)) + "px");
  }

  function wireCollege() {
    const c = cp();
    if (typeof renderProfileHero === "function") { try { renderProfileHero(); } catch (e) {} }
    const q = $("collegeQuery");
    if (q) {
      let timer;
      q.addEventListener("input", () => { c.query = q.value; clearTimeout(timer); timer = setTimeout(() => { rerenderResults(); saveCollege(); }, 180); });
      q.addEventListener("keydown", (e) => e.stopPropagation());
    }
    document.querySelectorAll("#screen-college [data-filter]").forEach((b) => b.addEventListener("click", () => { c.filter = b.dataset.filter; saveCollege(); renderCollegeScreen(); }));
    document.querySelectorAll("#screen-college [data-target]").forEach((b) => b.addEventListener("click", () => { c.targetMode = b.dataset.target; saveCollege(); renderCollegeScreen(); }));
    const addBox = $("chanceAdd");
    if (addBox) {
      addBox.addEventListener("input", () => { c.chanceQuery = addBox.value; const r = $("chanceAddResults"); if (r) r.innerHTML = chanceAddResultsHtml(addBox.value); });
      addBox.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); const first = document.querySelector("#chanceAddResults [data-add-college]"); if (first) first.click(); } });
    }
    const sortSel = $("chanceSort");
    if (sortSel) sortSel.addEventListener("change", () => { c.chanceSort = sortSel.value; saveCollege(); renderCollegeScreen(); });
    const custom = $("collegeCustomTarget");
    if (custom) custom.addEventListener("change", () => { c.customTarget = Number(custom.value) || null; saveCollege(); renderCollegeScreen(); });
    document.querySelectorAll("#screen-college [data-copy-equation]").forEach((b) => b.addEventListener("click", () => copyEquationText(b.dataset.copyEquation, b)));
    const back = $("collegeBack");
    if (back) back.addEventListener("click", closeCollege);

    const bind = (id, key, cast) => { const el = $(id); if (!el) return;
      el.addEventListener("input", () => { c[key] = cast ? cast(el.value) : el.value; saveCollege(); });
      el.addEventListener("change", () => { c[key] = cast ? cast(el.value) : el.value; saveCollege(); renderCollegeScreen(); }); };
    bind("collegeTestType", "testType");
    bind("collegeSat", "sat", (v) => (v === "" ? null : clamp(Number(v), SAT_MIN, SAT_MAX)));
    bind("collegeAct", "act", (v) => (v === "" ? null : clamp(Number(v), ACT_MIN, ACT_MAX)));
    bind("collegeGrade", "grade");
    bind("collegeGpa", "gpa", (v) => (v === "" ? null : Number(v)));
    bind("collegeGpaScale", "gpaScale");
    bind("collegeMajor", "major");
    bind("collegeApplyPlan", "applyPlan");
    bind("collegeClassRank", "classRank");
    bind("collegeHomeState", "homeState");
    bind("collegeAppStrength", "appStrength");
    ["collegeFirstGen", "collegeHardship", "collegeWorking", "collegeCaregiving", "collegeAthlete", "collegeLegacy"].forEach((id) => {
      const key = { collegeFirstGen: "firstGen", collegeHardship: "hardship", collegeWorking: "working", collegeCaregiving: "caregiving", collegeAthlete: "athlete", collegeLegacy: "legacy" }[id];
      const el = $(id);
      if (el) el.addEventListener("change", () => { c[key] = el.checked; saveCollege(); renderCollegeScreen(); });
    });
    const other = $("collegeOther");
    if (other) { other.addEventListener("keydown", (e) => e.stopPropagation()); other.addEventListener("input", () => { c.circumstanceOther = other.value; saveCollege(); }); other.addEventListener("change", () => { c.circumstanceOther = other.value; saveCollege(); renderCollegeScreen(); }); }
    ["collegeMajor", "collegeGpa", "collegeSat", "collegeAct", "collegeOther"].forEach((id) => { const el = $(id); if (el) el.addEventListener("keydown", (e) => e.stopPropagation()); });
    document.querySelectorAll("#screen-college [data-rigor]").forEach((el) => el.addEventListener("input", () => { c.rigor[el.dataset.rigor] = Math.max(0, Number(el.value) || 0); saveCollege(); }) || el.addEventListener("change", () => { c.rigor[el.dataset.rigor] = Math.max(0, Number(el.value) || 0); saveCollege(); renderCollegeScreen(); }));
    const rcBtn = $("btnReviewContext");
    if (rcBtn) rcBtn.addEventListener("click", () => { const o = $("collegeOther"); if (o) c.circumstanceOther = o.value; reviewContext(); });
    const usePred = $("collegeUsePredicted");
    if (usePred) usePred.addEventListener("click", () => {
      try {
        const p = predictScores();
        if (p.sat && p.sat.total) c.sat = clamp(p.sat.total.point, SAT_MIN, SAT_MAX);
        if (p.act && p.act.composite) c.act = clamp(p.act.composite.point, ACT_MIN, ACT_MAX);
      } catch (e) {}
      saveCollege(); renderCollegeScreen();
    });
    const add = $("collegeAddActivity");
    if (add) add.addEventListener("click", () => { c.activities.push({ name: "", type: "", years: null, hours: null, leadership: false }); saveCollege(); renderCollegeScreen(); });
    document.querySelectorAll("#collegeActivities .college-activity-row").forEach((row) => {
      const i = Number(row.dataset.i);
      const touch = () => { c.activities[i] = { name: "", type: "", years: null, hours: null, leadership: false, ...(c.activities[i] || {}) }; saveCollege(); };
      row.querySelectorAll("[data-act]").forEach((el) => {
        el.addEventListener("change", () => {
          const key = el.dataset.act;
          if (key === "remove") { c.activities.splice(i, 1); saveCollege(); renderCollegeScreen(); return; }
          touch();
          if (key === "leadership") c.activities[i].leadership = el.checked;
          else if (key === "years" || key === "hours") c.activities[i][key] = el.value === "" ? null : Number(el.value);
          else c.activities[i][key] = el.value;
          saveCollege(); renderCollegeScreen();
        });
        el.addEventListener("keydown", (e) => e.stopPropagation());
      });
    });
    const reply = $("collegeAskReply");
    if (reply && collegeLastAnswer) { try { renderAiText(reply, collegeLastAnswer); } catch (e) { reply.textContent = collegeLastAnswer; } }
    const askBtn = $("collegeAskBtn");
    if (askBtn) askBtn.addEventListener("click", () => {
      const input = $("collegeAsk");
      const question = input && input.value.trim();
      if (!question) return;
      const college = selectedCollege();
      if (!college) return;
      const est = estimateCollege(college);
      input.value = "";
      askCollegeGroq(college, est, question, $("collegeAskStatus"), $("collegeAskReply"));
    });
    const askInput = $("collegeAsk");
    if (askInput) askInput.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); askBtn && askBtn.click(); } });
    const clearSaved = $("collegeClearSaved");
    if (clearSaved) clearSaved.addEventListener("click", () => { c.saved = []; saveCollege(); renderCollegeScreen(); });

    const handle = $("collegeResize");
    if (handle) {
      let startY = 0, startH = 0, dragging = false;
      const detail = $("collegeDetail");
      const setSize = (h) => { c.panelHeight = Math.max(240, Math.min(1400, h)); if (detail) detail.style.setProperty("--college-panel-height", c.panelHeight + "px"); };
      handle.addEventListener("pointerdown", (e) => { dragging = true; startY = e.clientY; startH = c.panelHeight || 470; handle.setPointerCapture(e.pointerId); e.preventDefault(); });
      handle.addEventListener("pointermove", (e) => { if (dragging) setSize(startH + (e.clientY - startY)); });
      const stop = () => { if (dragging) { dragging = false; saveCollege(); } };
      handle.addEventListener("pointerup", stop); handle.addEventListener("pointercancel", stop);
      handle.addEventListener("keydown", (e) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        if (e.key === "Home") setSize(240);
        else if (e.key === "End") setSize(1400);
        else setSize((c.panelHeight || 470) + (e.key === "ArrowDown" ? 40 : -40));
        saveCollege();
      });
    }
  }

  // Expose a few helpers for tests and other screens.
  window.collegeFeature = {
    estimateCollege, selectCollege, OUTCOME_COLORS, chanceAddResultsHtml, isTestBlind, NATIONAL_BY_GRADE, open: null, filteredColleges, concordance: { satFromAct, actFromSat },
    unansweredReminder, meta: CD.meta, count: COLLEGES.length,
  };

  // ---- Open / close and app integration ----
  let collegeReturnView = "start";
  function openCollege(source) {
    if (state.view === "college") { renderCollegeScreen(); return; }
    collegeReturnView = state.view === "results" ? "results" : state.view === "test" || state.view === "routing" ? state.view : "start";
    state.view = "college";
    const c = cp();
    if (source === "predicted") {
      try {
        const p = predictScores();
        if (p.sat && p.sat.total) c.sat = clamp(p.sat.total.point, SAT_MIN, SAT_MAX);
        if (p.act && p.act.composite) c.act = clamp(p.act.composite.point, ACT_MIN, ACT_MAX);
        saveCollege();
      } catch (e) {}
    }
    render();
    try { scrollTo(0, 0); } catch (e) {}
  }
  function closeCollege() {
    selectedId = null;
    detailReturnsHome = false;
    document.body.classList.remove("cpop-open");
    state.view = collegeReturnView === "test" || collegeReturnView === "routing" ? collegeReturnView : collegeReturnView === "results" ? "results" : "start";
    render();
  }
  window.collegeFeature.open = openCollege;
  window.collegeFeature.openDetail = openCollegeDetail;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && selectedId != null && state.view === "college") { e.preventDefault(); e.stopPropagation(); closeDetail(); } }, true);

  const baseRender = render;
  render = function () {
    if (state.view === "college") { showScreen("screen-college"); renderCollegeScreen(); return; }
    baseRender();
  };
  // Delegated entry points so buttons added by other screens and re-rendered result rows always work.
  document.addEventListener("click", (e) => {
    if (!e.target || !e.target.closest) return;
    const open = e.target.closest("[data-college-open]");
    if (open) { e.preventDefault(); openCollege(open.dataset.collegeOpen || ""); return; }
    if (!e.target.closest("#screen-college")) return;
    if (e.target.closest("[data-close-detail]") || e.target.id === "collegeDetailHost") { e.preventDefault(); closeDetail(); return; }
    const save = e.target.closest("[data-save]");
    if (save) {
      e.preventDefault();
      const fromAdd = !!save.dataset.addCollege;
      if (fromAdd) { cp().chanceQuery = ""; }
      toggleSaved(save.dataset.save);
      if (fromAdd) { const box = $("chanceAdd"); if (box) box.focus(); showToast("Added to your colleges"); }
      return;
    }
    const pick = e.target.closest("[data-select]");
    if (pick) { e.preventDefault(); selectCollege(Number(pick.dataset.select)); }
  });
  const startBtn = $("btnCollegeStart");
  if (startBtn) startBtn.addEventListener("click", () => openCollege(""));
  const topBtn = $("btnCollege");
  if (topBtn) topBtn.addEventListener("click", () => openCollege(""));
})();
