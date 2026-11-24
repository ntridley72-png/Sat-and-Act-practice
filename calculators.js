/* FunSAT calculator pages. One script drives every calculator: the page holds <div data-calc="ID"> and this file renders
 * the tool into it. All maths comes from academic-calc.js (window.FunSATCalc), so every page uses the same tested formulas.
 *
 * Privacy: inputs are kept only in this browser (localStorage "funsatCalc_v1"), only after the student ticks "Remember on
 * this device", and "Clear" removes them. Nothing is sent to a server. "Use in college matching" writes the GPA or score
 * into the student's FunSAT profile on this device (it syncs only if they are signed in). Results never go into a URL
 * except a hypothetical GPA or score the student chooses to try in college matching.
 */
(function () {
  "use strict";
  const C = window.FunSATCalc;
  const root = document.querySelector("[data-calc]");
  if (!C || !root) return;
  const ID = root.dataset.calc;
  const STORE = "funsatCalc_v1", PROFILE = "satPrepProfile_v1", RECENT = "funsatCalcRecent_v1";

  // ---------------------------------------------------------------- small helpers
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const f2 = (v) => (v == null || !Number.isFinite(v) ? "—" : C.round2(v).toFixed(2));
  const f1 = (v) => (v == null || !Number.isFinite(v) ? "—" : (Math.round(v * 10) / 10).toFixed(1));
  const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const letterOf = (pct) => (pct == null ? "" : C.percentToLetter(pct));

  try { const r = (readJson(RECENT) || []).filter((x) => x !== ID); r.unshift(ID); writeJson(RECENT, r.slice(0, 6)); } catch (e) {}

  // ---------------------------------------------------------------- defaults (editable example data)
  const course = (name, grade, credits, type) => ({ name, grade, credits, type: type || "regular" });
  const DEFAULTS = {
    "gpa": { scale: "plusminus", courses: [course("English 10", "A-", 1), course("Geometry", "B+", 1), course("Biology", "B", 1), course("Spanish II", "A", 1), course("World History", "88", 1)] },
    "high-school-gpa": { scale: "plusminus", weights: clone(C.DEFAULT_WEIGHTS), bonusOnFailing: false, terms: [
      { name: "9th grade", courses: [course("English 9 Honors", "A-", 1, "honors"), course("Algebra I", "B+", 1), course("Biology", "A", 1), course("Spanish I", "B", 1)] },
      { name: "10th grade", courses: [course("AP World History", "B", 1, "ap"), course("Geometry Honors", "B+", 1, "honors"), course("Chemistry", "A-", 1), course("English 10", "A", 1)] }] },
    "weighted-gpa": { scale: "plusminus", weights: clone(C.DEFAULT_WEIGHTS), bonusOnFailing: false, courses: [course("AP Biology", "B+", 1, "ap"), course("Honors English", "A-", 1, "honors"), course("Precalculus", "B", 1), course("US History", "A", 1), course("Dual-enrollment Psychology", "A", 1, "de")] },
    "college-gpa": { scale: "plusminus", prior: { gpa: "", credits: "" }, courses: [course("Calculus I", "B+", 4), course("Composition", "A", 3), course("Intro to Psychology", "A-", 3), course("Chemistry lab", "B", 1)] },
    "cumulative-gpa": { scale: "plusminus", prior: { gpa: "3.20", credits: "60" }, courses: [course("Course 1", "A", 3), course("Course 2", "A-", 3), course("Course 3", "B+", 3), course("Course 4", "B", 3)] },
    "gpa-improvement": { current: "2.90", credits: "60", remaining: "60", target: "3.20", max: "4.0",
      retake: { credits: "3", old: "D", now: "B+", policy: "replace" },
      scenarios: [{ name: "Realistic", gpa: "3.3" }, { name: "Straight A's", gpa: "4.0" }, { name: "Rough semester", gpa: "2.5" }], perTerm: "15" },
    "grade": { items: [{ name: "Quiz 1", earned: "18", possible: "20" }, { name: "Lab report", earned: "41", possible: "50" }, { name: "Unit test", earned: "84", possible: "100" }, { name: "Extra credit", earned: "3", possible: "0" }] },
    "weighted-grade": { cats: [
      { name: "Homework", weight: "20", dropLowest: "0", items: [{ earned: "9", possible: "10" }, { earned: "10", possible: "10" }, { earned: "7", possible: "10" }] },
      { name: "Quizzes", weight: "20", dropLowest: "0", items: [{ earned: "17", possible: "20" }, { earned: "15", possible: "20" }] },
      { name: "Tests", weight: "40", dropLowest: "0", items: [{ earned: "82", possible: "100" }] },
      { name: "Final exam", weight: "20", dropLowest: "0", items: [] }] },
    "final-grade": { current: "86", weight: "20", target: "88", max: "100" },
    "semester-grade": { parts: [{ name: "Quarter 1", weight: "40", grade: "91" }, { name: "Quarter 2", weight: "40", grade: "84" }, { name: "Final exam", weight: "20", grade: "" }], target: "88" },
    "sat-superscore": { attempts: [{ label: "March", rw: "620", math: "680" }, { label: "May", rw: "670", math: "650" }] },
    "act-score": { version: "enhanced", english: "26", math: "24", reading: "28", science: "" },
    "act-superscore": { attempts: [{ label: "February", english: "25", math: "27", reading: "24", science: "" }, { label: "April", english: "28", math: "25", reading: "26", science: "" }] },
  };
  if (!DEFAULTS[ID]) return;

  // ---------------------------------------------------------------- state, undo, saving
  const saved = readJson(STORE) || {};
  let remember = !!(saved[ID]);
  let S = remember ? Object.assign(clone(DEFAULTS[ID]), saved[ID]) : clone(DEFAULTS[ID]);
  const undo = [];
  function commit(mutate) {
    undo.push(clone(S)); if (undo.length > 40) undo.shift();
    mutate(S); persist(); render();
  }
  function persist() {
    const all = readJson(STORE) || {};
    if (remember) all[ID] = S; else delete all[ID];
    writeJson(STORE, all);
  }

  // Prefill from the profile the app already has (official scores on the Plan screen), so nobody types them twice.
  function profile() { return readJson(PROFILE) || {}; }
  function prefillFromProfile() {
    if (remember) return "";
    const reps = (profile().scoreReports || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (ID === "sat-superscore") {
      const sat = reps.filter((r) => r.kind === "sat" && r.sections && r.sections.rw && r.sections.math);
      if (sat.length) { S.attempts = sat.map((r) => ({ label: r.date, rw: String(r.sections.rw), math: String(r.sections.math) })); return "Filled in from the SAT scores on your Plan page."; }
    }
    if (ID === "act-superscore") {
      const act = reps.filter((r) => r.kind === "act" && r.sections && r.sections.english && r.sections.math && r.sections.reading);
      if (act.length) { S.attempts = act.map((r) => ({ label: r.date, english: String(r.sections.english), math: String(r.sections.math), reading: String(r.sections.reading), science: r.sections.science ? String(r.sections.science) : "" })); return "Filled in from the ACT scores on your Plan page."; }
    }
    return "";
  }
  const prefillNote = prefillFromProfile();

  /** Write GPA / scores into the FunSAT profile's college section (the same fields the College screen edits). */
  function saveToProfile(fields) {
    const p = profile();
    p.college = p.college && typeof p.college === "object" ? p.college : {};
    Object.assign(p.college, fields);
    p.updatedAt = Date.now(); p.dirty = true;   // the app's sync picks this up next time it opens while signed in
    return writeJson(PROFILE, p);
  }
  function collegeLink(params) {
    const q = new URLSearchParams(Object.assign({ open: "college" }, params));
    return "/?" + q.toString();
  }

  // ---------------------------------------------------------------- shared pieces
  const scaleSelect = (val) => '<label class="calc-field"><span>Grading scale</span><select data-k="scale">' +
    Object.keys(C.SCALES).map((k) => '<option value="' + k + '"' + (k === val ? " selected" : "") + ">" + esc(C.SCALES[k].label) + "</option>").join("") + "</select></label>";
  const typeSelect = (val, path) => '<select data-k="' + path + '" aria-label="Course level">' +
    Object.keys(C.COURSE_TYPES).map((k) => '<option value="' + k + '"' + (k === val ? " selected" : "") + ">" + C.COURSE_TYPES[k] + "</option>").join("") + "</select>";
  const inp = (path, val, opts) => {
    opts = opts || {};
    return '<input data-k="' + path + '" value="' + esc(val) + '"' + (opts.mode ? ' inputmode="' + opts.mode + '"' : ' inputmode="decimal"') +
      (opts.label ? ' aria-label="' + esc(opts.label) + '"' : "") + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : "") + (opts.cls ? ' class="' + opts.cls + '"' : "") + ">";
  };
  const field = (label, path, val, opts) => '<label class="calc-field"><span>' + label + "</span>" + inp(path, val, opts) + (opts && opts.hint ? '<small>' + opts.hint + "</small>" : "") + "</label>";
  const btn = (act, label, extra) => '<button type="button" class="calc-btn' + (extra ? " " + extra : "") + '" data-act="' + act + '">' + label + "</button>";

  function courseTable(list, path, opts) {
    opts = opts || {};
    const rows = list.map((c, i) => {
      const r = C.courseResult(c, opts.calcOpts);
      const out = r.error ? '<span class="calc-err">' + esc(r.error) + "</span>" : r.counted ? f2(opts.weighted ? r.weighted : r.unweighted) + (opts.weighted ? ' <small class="muted">(' + f2(r.unweighted) + " unw.)</small>" : "") : '<span class="muted">' + (r.note ? "not counted" : "0 credits") + "</span>";
      return "<tr>" +
        "<td>" + inp(path + "." + i + ".name", c.name, { mode: "text", label: "Course name", cls: "calc-name" }) + "</td>" +
        "<td>" + inp(path + "." + i + ".grade", c.grade, { mode: "text", label: "Grade for " + (c.name || "course " + (i + 1)), ph: "A- or 91" }) + "</td>" +
        "<td>" + inp(path + "." + i + ".credits", c.credits, { label: "Credits for " + (c.name || "course " + (i + 1)) }) + "</td>" +
        (opts.types ? "<td>" + typeSelect(c.type, path + "." + i + ".type") + "</td>" : "") +
        '<td class="calc-num">' + out + "</td>" +
        '<td><button type="button" class="calc-x" data-act="del" data-path="' + path + '" data-i="' + i + '" aria-label="Remove ' + esc(c.name || "course " + (i + 1)) + '">×</button></td></tr>';
    }).join("");
    return '<div class="calc-scroll"><table class="calc-table"><thead><tr><th scope="col">Course</th><th scope="col">Grade</th><th scope="col">' + (opts.creditLabel || "Credits") + "</th>" +
      (opts.types ? '<th scope="col">Level</th>' : "") + '<th scope="col" class="calc-num">Points</th><th scope="col"><span class="sr">Remove</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<button type="button" class="calc-add" data-act="add" data-path="' + path + '">+ Add a course</button>';
  }

  function weightsPanel() {
    const w = S.weights;
    const sum = "Honors +" + w.honors + ", AP +" + w.ap + ", IB +" + w.ib + ", dual enrollment +" + w.de + (S.bonusOnFailing ? ", F gets the bonus" : "");
    return '<details class="calc-adv"' + (S.policyOpen ? " open" : "") + ' data-policy><summary>Your school\'s weighting policy <small>' + esc(sum) + '</small></summary><div class="calc-grid">' +
      Object.keys(C.COURSE_TYPES).filter((k) => k !== "regular").map((k) => field(C.COURSE_TYPES[k] + " adds", "weights." + k, w[k], { hint: "points on top of the grade" })).join("") +
      '</div><label class="calc-check"><input type="checkbox" data-k="bonusOnFailing"' + (S.bonusOnFailing ? " checked" : "") + "> Give the level bonus to an F too</label>" +
      '<p class="muted small">Common policy: Honors +0.5, AP/IB/dual enrollment +1.0, no bonus for an F. Many schools differ (some weight only grades of C or better, some cap at 5.0): check your handbook and set it here.</p></details>';
  }

  function resultBox(rows, note) {
    return '<div class="calc-result" role="status" aria-live="polite">' + rows.map(([label, value, big]) =>
      '<div class="calc-r' + (big ? " big" : "") + '"><span>' + label + "</span><b>" + value + "</b></div>").join("") + (note ? '<p class="calc-note">' + note + "</p>" : "") + "</div>";
  }

  function toolbar(summary) {
    return '<div class="calc-bar">' + btn("undo", "Undo", undo.length ? "" : "is-off") + btn("reset", "Reset") + btn("copy", "Copy result") +
      '<label class="calc-check"><input type="checkbox" data-act="remember"' + (remember ? " checked" : "") + "> Remember on this device</label>" +
      '<span class="calc-copied" aria-live="polite"></span></div>' +
      '<p class="calc-privacy small muted">Calculations run in your browser. Nothing is sent anywhere. With "Remember" ticked, your entries are kept in this browser only; untick it to delete them.</p>' +
      '<textarea class="sr" aria-hidden="true" tabindex="-1" data-summary>' + esc(summary) + "</textarea>";
  }

  function collegeActions(opts) {
    // opts: {gpa, scale, sat, act, label}
    const ok = (v) => v != null && Number.isFinite(Number(v));
    if (!ok(opts.gpa)) opts.gpa = null;
    if (!ok(opts.sat)) opts.sat = null;
    if (!ok(opts.act)) opts.act = null;
    if (opts.gpa == null && opts.sat == null && opts.act == null) return "";
    const btns = [];
    if (opts.gpa != null) btns.push(btn("profile-gpa", "Use this GPA in my college profile"));
    if (opts.sat != null) btns.push(btn("profile-sat", "Use " + opts.sat + " in my college profile"));
    if (opts.act != null) btns.push(btn("profile-act", "Use " + opts.act + " in my college profile"));
    const params = {};
    if (opts.gpa != null) { params.gpa = C.round2(opts.gpa); params.scale = opts.scale || "4uw"; }
    if (opts.sat != null) params.sat = opts.sat;
    if (opts.act != null) params.act = opts.act;
    params.hyp = "1";
    return '<div class="calc-next"><h2 class="calc-h">Next step</h2><p>' + (opts.label || "See which colleges fit these numbers.") + "</p>" +
      '<div class="calc-actions"><a class="calc-btn primary" href="' + esc(collegeLink(params)) + '">Find colleges that fit these results</a>' + btns.join("") + "</div>" +
      '<p class="small muted">"Find colleges" shows these numbers as a what-if: your saved profile is not changed unless you choose "Use ... in my college profile".</p></div>';
  }

  // ---------------------------------------------------------------- each tool
  const TOOLS = {};

  TOOLS["gpa"] = () => {
    const opts = { scale: S.scale };
    const g = C.gpa(S.courses, opts);
    const html = '<div class="calc-grid">' + scaleSelect(S.scale) + "</div>" + courseTable(S.courses, "courses", { calcOpts: opts }) +
      resultBox([["GPA", f2(g.unweighted), true], ["Credits counted", g.credits], ["Quality points", f2(g.qualityPoints)]],
        "Grades can be letters (B+) or percents (88, read with a standard 90/80/70 scale with plus and minus bands). Pass/fail and withdrawals are left out.");
    return { html: html + collegeActions({ gpa: g.unweighted, scale: "4uw" }), summary: "GPA " + f2(g.unweighted) + " over " + g.credits + " credits", gpa: g.unweighted };
  };

  TOOLS["weighted-gpa"] = () => {
    const opts = { scale: S.scale, weights: S.weights, bonusOnFailing: S.bonusOnFailing };
    const g = C.gpa(S.courses, opts);
    const html = '<div class="calc-grid">' + scaleSelect(S.scale) + "</div>" + weightsPanel() + courseTable(S.courses, "courses", { types: true, weighted: true, calcOpts: opts }) +
      resultBox([["Weighted GPA", f2(g.weighted), true], ["Unweighted GPA", f2(g.unweighted)], ["Credits", g.credits]],
        "Weighted GPA adds your school's level bonus to each course's grade points, then averages by credits. Colleges usually recalculate GPA their own way, so keep both numbers.");
    return { html: html + collegeActions({ gpa: g.unweighted, scale: "4uw", label: "Colleges compare unweighted GPAs most consistently, so the college tools use your unweighted " + f2(g.unweighted) + "." }), summary: "Weighted GPA " + f2(g.weighted) + ", unweighted " + f2(g.unweighted) };
  };

  TOOLS["high-school-gpa"] = () => {
    const opts = { scale: S.scale, weights: S.weights, bonusOnFailing: S.bonusOnFailing };
    const t = C.termsGpa(S.terms, opts);
    const terms = S.terms.map((term, ti) => '<section class="calc-term"><div class="calc-term-head">' + inp("terms." + ti + ".name", term.name, { mode: "text", label: "Year or semester name", cls: "calc-name" }) +
      '<span class="muted small">' + f2(t.terms[ti].unweighted) + " unweighted · " + f2(t.terms[ti].weighted) + " weighted</span>" +
      '<button type="button" class="calc-x" data-act="del-term" data-i="' + ti + '" aria-label="Remove ' + esc(term.name) + '">×</button></div>' +
      courseTable(term.courses, "terms." + ti + ".courses", { types: true, weighted: true, calcOpts: opts }) + "</section>").join("");
    const trend = t.terms.filter((x) => x.unweighted != null);
    const chart = trend.length > 1 ? '<div class="calc-trend" aria-label="GPA by term">' + trend.map((x) => '<div class="calc-bar-col"><i style="height:' + Math.round((x.unweighted / 4) * 100) + '%"></i><span>' + f2(x.unweighted) + "</span><small>" + esc(x.name) + "</small></div>").join("") + "</div>" : "";
    const html = '<div class="calc-grid">' + scaleSelect(S.scale) + "</div>" + weightsPanel() + terms +
      '<button type="button" class="calc-add" data-act="add-term">+ Add a semester or year</button>' +
      resultBox([["Cumulative unweighted", f2(t.cumulative.unweighted), true], ["Cumulative weighted", f2(t.cumulative.weighted), true], ["Credits", t.cumulative.credits]],
        "Cumulative GPA averages every course by credit, so a year with more classes counts more. It is not the average of the yearly GPAs.") + chart;
    return { html: html + collegeActions({ gpa: t.cumulative.unweighted, scale: "4uw" }), summary: "High school GPA " + f2(t.cumulative.unweighted) + " unweighted, " + f2(t.cumulative.weighted) + " weighted" };
  };

  TOOLS["college-gpa"] = () => {
    const opts = { scale: S.scale };
    const cu = C.cumulativeGpa(S.prior, S.courses, opts);
    const html = '<div class="calc-grid">' + scaleSelect(S.scale) + field("Cumulative GPA so far (optional)", "prior.gpa", S.prior.gpa, { ph: "3.10" }) +
      field("Credit hours so far", "prior.credits", S.prior.credits, { ph: "45", hint: "attempted hours that count toward GPA" }) + "</div>" +
      courseTable(S.courses, "courses", { calcOpts: opts, creditLabel: "Credit hours" }) +
      resultBox([["This semester", f2(cu.term), true], ["New cumulative GPA", f2(cu.gpa), true], ["Total credit hours", cu.credits], ["Change", cu.change == null ? "—" : (cu.change >= 0 ? "+" : "") + f2(cu.change)]],
        "College GPA weights each grade by credit hours and has no AP or honors bonus. Repeated courses, pass/fail and transfer credit follow your college's rules; check its catalog.");
    return { html, summary: "Semester GPA " + f2(cu.term) + ", cumulative " + f2(cu.gpa) + " over " + cu.credits + " credit hours" };
  };

  TOOLS["cumulative-gpa"] = () => {
    const opts = { scale: S.scale };
    const cu = C.cumulativeGpa(S.prior, S.courses, opts);
    const html = '<div class="calc-grid">' + field("Current cumulative GPA", "prior.gpa", S.prior.gpa) + field("Credits completed", "prior.credits", S.prior.credits, { hint: "credits that count toward that GPA" }) + scaleSelect(S.scale) + "</div>" +
      '<h2 class="calc-h">This term\'s courses</h2>' + courseTable(S.courses, "courses", { calcOpts: opts }) +
      resultBox([["New cumulative GPA", f2(cu.gpa), true], ["This term", f2(cu.term)], ["Change", cu.change == null ? "—" : (cu.change >= 0 ? "+" : "") + f2(cu.change)], ["Total credits", cu.credits]],
        "New GPA = (current GPA × credits so far + this term's grade points) ÷ all credits. The more credits you already have, the less one term moves it.");
    return { html: html + collegeActions({ gpa: cu.gpa, scale: "4uw" }), summary: "Cumulative GPA " + esc(S.prior.gpa) + " → " + f2(cu.gpa) };
  };

  TOOLS["gpa-improvement"] = () => {
    const mx = Number(S.max) || 4;
    const n = C.gpaNeeded(S.current, S.credits, S.remaining, S.target, mx);
    const needText = n.error ? '<span class="calc-err">' + esc(n.error) + "</span>" : n.feasible ? f2(n.needed) + (n.needed > 0 ? '<small class="calc-sub">' + letterBand(n.needed) + "</small>" : "") : "Not reachable";
    const rt = S.retake;
    const oldP = C.gradePoints(rt.old), newP = C.gradePoints(rt.now);
    const rr = C.retakeGpa(S.current, S.credits, { credits: rt.credits, oldPoints: oldP, newPoints: newP }, rt.policy);
    const per = Number(S.perTerm) || 15;
    const scen = S.scenarios.map((sc, i) => {
      const pr = C.projectGpa(S.current, S.credits, Array.from({ length: Math.max(1, Math.ceil((Number(S.remaining) || 0) / per)) }, () => ({ credits: per, gpa: sc.gpa })));
      return { sc, i, pr };
    });
    const maxTerms = Math.max(1, ...scen.map((x) => x.pr.length));
    const scenTable = '<div class="calc-scroll"><table class="calc-table"><thead><tr><th scope="col">Scenario</th><th scope="col">GPA each term</th>' +
      Array.from({ length: maxTerms }, (_, k) => '<th scope="col" class="calc-num">After term ' + (k + 1) + "</th>").join("") + '<th scope="col"><span class="sr">Remove</span></th></tr></thead><tbody>' +
      scen.map(({ sc, i, pr }) => "<tr><td>" + inp("scenarios." + i + ".name", sc.name, { mode: "text", label: "Scenario name", cls: "calc-name" }) + "</td><td>" + inp("scenarios." + i + ".gpa", sc.gpa, { label: "GPA each term for " + sc.name }) + "</td>" +
        Array.from({ length: maxTerms }, (_, k) => '<td class="calc-num">' + (pr[k] ? f2(pr[k].gpa) : "") + "</td>").join("") +
        '<td><button type="button" class="calc-x" data-act="del" data-path="scenarios" data-i="' + i + '" aria-label="Remove ' + esc(sc.name) + '">×</button></td></tr>').join("") + "</tbody></table></div>" +
      '<button type="button" class="calc-add" data-act="add-scenario">+ Add a scenario</button>';
    const html = '<div class="calc-grid">' + field("Current GPA", "current", S.current) + field("Credits so far", "credits", S.credits) + field("Credits still to take", "remaining", S.remaining, { hint: "before graduation or the date you care about" }) +
      field("Target GPA", "target", S.target) + field("Highest grade points per credit", "max", S.max, { hint: "4.0 for most unweighted scales" }) + "</div>" +
      resultBox([["Average you need in each remaining credit", needText, true], ["Final GPA with straight A's", f2(n.best)], ["Final GPA if every remaining grade is an F", f2(n.worst)]],
        n.error ? "" : n.feasible ? "Needed average = (target × all credits − current GPA × credits so far) ÷ credits left, so (" + esc(S.target) + " × " + ((Number(S.credits) || 0) + (Number(S.remaining) || 0)) + " − " + esc(S.current) + " × " + esc(S.credits) + ") ÷ " + esc(S.remaining) + " = " + f2(n.needed) + "." : esc(n.reason) + " Try a later date (more credits) or a different target.") +
      '<h2 class="calc-h">Retaking a course</h2><div class="calc-grid">' + field("Course credits", "retake.credits", rt.credits) + field("Old grade", "retake.old", rt.old, { mode: "text" }) + field("New grade", "retake.now", rt.now, { mode: "text" }) +
      '<label class="calc-field"><span>Your school\'s retake rule</span><select data-k="retake.policy"><option value="replace"' + (rt.policy === "replace" ? " selected" : "") + '>New grade replaces the old one</option><option value="average"' + (rt.policy === "average" ? " selected" : "") + ">Both grades count (averaged)</option></select></label></div>" +
      resultBox([["GPA after the retake", rr.error ? '<span class="calc-err">' + esc(rr.error) + "</span>" : f2(rr.gpa), true], ["Credits counted", rr.error ? "—" : rr.credits]],
        rt.policy === "replace" ? "Replacement removes the old grade's points and keeps your credits the same." : "Averaging keeps the old grade and adds the new one, so the course's credits count twice.") +
      '<h2 class="calc-h">Compare scenarios</h2>' + field("Credits per term", "perTerm", S.perTerm) + scenTable;
    return { html: html + collegeActions({ gpa: n.feasible && !n.error ? Number(S.target) : null, scale: "4uw", label: "See how a " + esc(S.target) + " GPA changes your college matches (shown as a what-if)." }), summary: "Need " + needText + " to reach " + S.target };
  };
  // Where an average in grade points falls on the plus/minus scale: "a B+ average" or "between a B+ and an A-".
  function letterBand(points) {
    const pts = C.SCALES.plusminus.points, order = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A"];
    const an = (l) => (/^[AF]/.test(l) ? "an " : "a ") + l;
    const exact = order.find((l) => Math.abs(pts[l] - points) < 1e-9);
    if (exact) return an(exact) + " average";
    const hi = order.find((l) => pts[l] > points), lo = order.slice().reverse().find((l) => pts[l] < points);
    return hi && lo ? "between " + an(lo) + " and " + an(hi) + " average" : "";
  }

  TOOLS["grade"] = () => {
    const pg = C.pointsGrade(S.items);
    const rows = S.items.map((it, i) => "<tr><td>" + inp("items." + i + ".name", it.name, { mode: "text", label: "Assignment name", cls: "calc-name" }) + "</td><td>" + inp("items." + i + ".earned", it.earned, { label: "Points earned" }) + "</td><td>" +
      inp("items." + i + ".possible", it.possible, { label: "Points possible" }) + '</td><td class="calc-num">' + (Number(it.possible) > 0 && it.earned !== "" ? f1((it.earned / it.possible) * 100) + "%" : Number(it.possible) === 0 && Number(it.earned) > 0 ? "extra" : "") +
      '</td><td><button type="button" class="calc-x" data-act="del" data-path="items" data-i="' + i + '" aria-label="Remove ' + esc(it.name) + '">×</button></td></tr>').join("");
    const html = '<div class="calc-scroll"><table class="calc-table"><thead><tr><th scope="col">Assignment</th><th scope="col">Earned</th><th scope="col">Possible</th><th scope="col" class="calc-num">Score</th><th scope="col"><span class="sr">Remove</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<button type="button" class="calc-add" data-act="add-item">+ Add an assignment</button>' +
      resultBox([["Current grade", pg.percent == null ? "—" : f1(pg.percent) + "% " + letterOf(pg.percent), true], ["Points", pg.earned + " / " + pg.possible]],
        "Points earned ÷ points possible. Leave a score blank if it is not graded yet. Possible = 0 makes it extra credit. If your teacher weights categories, use the weighted grade calculator.");
    return { html, summary: "Grade " + f1(pg.percent) + "%" };
  };

  TOOLS["weighted-grade"] = () => {
    const wg = C.weightedGrade(S.cats);
    const cats = S.cats.map((c, ci) => {
      const r = wg.rows[ci];
      const items = c.items.map((it, ii) => '<span class="calc-item">' + inp("cats." + ci + ".items." + ii + ".earned", it.earned, { label: c.name + " item " + (ii + 1) + " earned" }) + "/" +
        inp("cats." + ci + ".items." + ii + ".possible", it.possible, { label: c.name + " item " + (ii + 1) + " possible" }) +
        '<button type="button" class="calc-x" data-act="del" data-path="cats.' + ci + '.items" data-i="' + ii + '" aria-label="Remove item">×</button></span>').join("");
      return '<section class="calc-cat"><div class="calc-cat-head">' + inp("cats." + ci + ".name", c.name, { mode: "text", label: "Category name", cls: "calc-name" }) +
        '<label class="calc-inline">Weight ' + inp("cats." + ci + ".weight", c.weight, { label: c.name + " weight percent" }) + "%</label>" +
        '<label class="calc-inline">Drop lowest ' + inp("cats." + ci + ".dropLowest", c.dropLowest, { label: c.name + " drop lowest", mode: "numeric" }) + "</label>" +
        '<b class="calc-num">' + (r && r.percent != null ? f1(r.percent) + "%" : '<span class="muted">not graded</span>') + "</b>" +
        '<button type="button" class="calc-x" data-act="del" data-path="cats" data-i="' + ci + '" aria-label="Remove ' + esc(c.name) + '">×</button></div>' +
        '<div class="calc-items">' + items + '<button type="button" class="calc-add small" data-act="add-catitem" data-i="' + ci + '">+ score</button></div></section>';
    }).join("");
    const note = (!wg.weightsAddTo100 ? '<span class="calc-warn">Your weights add up to ' + f1(wg.totalWeight) + "%, not 100%. Check the syllabus.</span> " : "") +
      (wg.gradedWeight < wg.totalWeight ? "Categories with nothing graded yet are left out and the rest are scaled to 100%, which is what most online gradebooks show. " : "") +
      "Each category is points earned ÷ points possible; the course grade is the weighted average of the categories.";
    const html = cats + '<button type="button" class="calc-add" data-act="add-cat">+ Add a category</button>' +
      resultBox([["Current grade", wg.percent == null ? "—" : f1(wg.percent) + "% " + letterOf(wg.percent), true], ["Weight graded so far", f1(wg.gradedWeight) + "%"]], note);
    const finalLink = wg.percent != null && wg.gradedWeight < wg.totalWeight ? '<p><a href="/calculators/final-grade/">What do I need on the final?</a> Your current grade is ' + f1(wg.percent) + "% with " + f1(wg.totalWeight - wg.gradedWeight) + "% of the course still to come.</p>" : "";
    return { html: html + finalLink, summary: "Weighted grade " + f1(wg.percent) + "%" };
  };

  TOOLS["final-grade"] = () => {
    const r = C.finalNeeded(S.current, S.weight, S.target, S.max);
    let main, note;
    if (r.error) { main = '<span class="calc-err">' + esc(r.error) + "</span>"; note = ""; }
    else if (r.status === "impossible") { main = "Not possible"; note = "You would need " + f1(r.needed) + "% on the final, above the maximum of " + esc(S.max) + "%. The best you can finish with is " + f1(r.best) + "% " + letterOf(r.best) + "."; }
    else if (r.status === "guaranteed") { main = "Already safe"; note = "Even a 0 on the final leaves you at " + f1(r.worst) + "%, at or above your target."; }
    else { main = f1(r.needed) + "%"; note = "Needed = (target − current × (1 − final weight)) ÷ final weight. With a perfect final you would finish at " + f1(r.best) + "%."; }
    const table = r.error ? "" : '<table class="calc-table compact"><thead><tr><th scope="col">If you score</th><th scope="col" class="calc-num">Course grade</th></tr></thead><tbody>' +
      C.finalOutcomes(S.current, S.weight, [100, 95, 90, 85, 80, 75, 70, 60, 50]).map((o) => "<tr><td>" + o.final + '%</td><td class="calc-num">' + f1(o.course) + "% " + letterOf(o.course) + "</td></tr>").join("") + "</tbody></table>";
    const html = '<div class="calc-grid">' + field("Current grade (%)", "current", S.current) + field("Final exam weight (%)", "weight", S.weight) + field("Grade you want (%)", "target", S.target) +
      field("Highest possible final score (%)", "max", S.max, { hint: "over 100 if the final has extra credit" }) + "</div>" + resultBox([["You need on the final", main, true]], note) + table;
    return { html, summary: "Need " + main + " on the final for " + S.target + "%" };
  };

  TOOLS["semester-grade"] = () => {
    const sg = C.semesterGrade(S.parts);
    const missing = S.parts.filter((p) => String(p.grade).trim() === "");
    let need = "";
    if (missing.length === 1 && sg.percent != null) {
      const w = Number(missing[0].weight), tot = S.parts.reduce((a, p) => a + (Number(p.weight) || 0), 0);
      const r = C.finalNeeded(sg.percent, (w / tot) * 100, S.target, 100);
      need = r.error ? "" : r.status === "impossible" ? "Reaching " + esc(S.target) + "% would need " + f1(r.needed) + "% on " + esc(missing[0].name) + ", which is not possible." :
        r.status === "guaranteed" ? "You reach " + esc(S.target) + "% whatever you score on " + esc(missing[0].name) + "." : "You need " + f1(r.needed) + "% on " + esc(missing[0].name) + " to reach " + esc(S.target) + "%.";
    }
    const rows = S.parts.map((p, i) => "<tr><td>" + inp("parts." + i + ".name", p.name, { mode: "text", label: "Part name", cls: "calc-name" }) + "</td><td>" + inp("parts." + i + ".weight", p.weight, { label: p.name + " weight" }) + "</td><td>" +
      inp("parts." + i + ".grade", p.grade, { label: p.name + " grade", ph: "blank if not yet" }) + '</td><td><button type="button" class="calc-x" data-act="del" data-path="parts" data-i="' + i + '" aria-label="Remove ' + esc(p.name) + '">×</button></td></tr>').join("");
    const html = '<div class="calc-scroll"><table class="calc-table"><thead><tr><th scope="col">Part</th><th scope="col">Weight %</th><th scope="col">Grade %</th><th scope="col"><span class="sr">Remove</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<button type="button" class="calc-add" data-act="add-part">+ Add a part</button>' + '<div class="calc-grid">' + field("Semester grade you want (%)", "target", S.target) + "</div>" +
      resultBox([["Semester grade so far", sg.percent == null ? "—" : f1(sg.percent) + "% " + letterOf(sg.percent), true]], (need ? need + " " : "") + "Schools combine quarters, midterms and finals differently (40/40/20, 45/45/10, 2 quarters + exam...). Enter your school's split; blank parts are left out until you fill them in.");
    return { html, summary: "Semester grade " + f1(sg.percent) + "%" };
  };

  TOOLS["sat-superscore"] = () => {
    const r = C.satSuperscore(S.attempts);
    const rows = S.attempts.map((a, i) => "<tr><td>" + inp("attempts." + i + ".label", a.label, { mode: "text", label: "Test date", cls: "calc-name" }) + "</td><td>" + inp("attempts." + i + ".rw", a.rw, { mode: "numeric", label: "Reading and Writing" }) + "</td><td>" +
      inp("attempts." + i + ".math", a.math, { mode: "numeric", label: "Math" }) + '</td><td class="calc-num">' + ((Number(a.rw) || 0) + (Number(a.math) || 0) || "") + '</td><td><button type="button" class="calc-x" data-act="del" data-path="attempts" data-i="' + i + '" aria-label="Remove test">×</button></td></tr>').join("");
    const html = (prefillNote ? '<p class="calc-prefill">' + prefillNote + "</p>" : "") +
      '<div class="calc-scroll"><table class="calc-table"><thead><tr><th scope="col">Test date</th><th scope="col">Reading and Writing</th><th scope="col">Math</th><th scope="col" class="calc-num">Total</th><th scope="col"><span class="sr">Remove</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<button type="button" class="calc-add" data-act="add-sat">+ Add a test date</button>' +
      resultBox(r.error ? [["Superscore", '<span class="calc-err">' + esc(r.error) + "</span>", true]] :
        [["SAT superscore", r.superscore, true], ["Reading and Writing", r.rw + (r.rwFrom ? " (" + esc(r.rwFrom) + ")" : "")], ["Math", r.math + (r.mathFrom ? " (" + esc(r.mathFrom) + ")" : "")], ["Best single test", r.bestSingle]],
        "Superscore = your highest Reading and Writing plus your highest Math from any SAT dates. Many colleges superscore, some use your best single sitting, and some want every score: check each college's policy.");
    const practice = r.error ? "" : '<p class="calc-practice">To raise it: drill your weaker section by skill in <a href="' + (r.math < r.rw ? "/sat-math/" : "/sat-reading-writing/") + '">' + (r.math < r.rw ? "SAT Math" : "SAT Reading and Writing") + ' by skill</a>, or take a <a href="/sat-practice-test/">full practice test</a>.</p>';
    return { html: html + practice + (r.error ? "" : collegeActions({ sat: r.superscore })), summary: "SAT superscore " + (r.superscore || "—") };
  };

  const ACT_ROW = ["english", "math", "reading", "science"];
  TOOLS["act-score"] = () => {
    const r = C.actComposite(S, S.version);
    const html = '<div class="calc-grid">' + '<label class="calc-field"><span>Test version</span><select data-k="version"><option value="enhanced"' + (S.version !== "legacy" ? " selected" : "") +
      '>Enhanced ACT (from Sept 2025; April 2025 online)</option><option value="legacy"' + (S.version === "legacy" ? " selected" : "") + ">Earlier ACT (four-section composite)</option></select></label>" +
      ACT_ROW.map((k) => field(k[0].toUpperCase() + k.slice(1) + (k === "science" && S.version !== "legacy" ? " (optional)" : ""), k, S[k], { mode: "numeric" })).join("") + "</div>" +
      resultBox([["ACT composite", r.error ? '<span class="calc-err">' + esc(r.error) + "</span>" : r.composite, true], ["Exact average", r.error ? "—" : r.average.toFixed(2)]],
        S.version === "legacy" ? "Earlier ACT: composite = average of English, Math, Reading and Science, rounded to the nearest whole number (.5 rounds up)." :
          "Enhanced ACT: composite = average of English, Math and Reading, rounded to the nearest whole number (.5 rounds up). Science is optional and reported separately; it does not change the composite.");
    return { html: html + (r.error ? "" : collegeActions({ act: r.composite })), summary: "ACT composite " + (r.composite || "—") };
  };

  TOOLS["act-superscore"] = () => {
    const r = C.actSuperscore(S.attempts);
    const rows = S.attempts.map((a, i) => "<tr><td>" + inp("attempts." + i + ".label", a.label, { mode: "text", label: "Test date", cls: "calc-name" }) + "</td>" +
      ACT_ROW.map((k) => "<td>" + inp("attempts." + i + "." + k, a[k], { mode: "numeric", label: k, ph: k === "science" ? "optional" : "" }) + "</td>").join("") +
      '<td><button type="button" class="calc-x" data-act="del" data-path="attempts" data-i="' + i + '" aria-label="Remove test">×</button></td></tr>').join("");
    const html = (prefillNote ? '<p class="calc-prefill">' + prefillNote + "</p>" : "") +
      '<div class="calc-scroll"><table class="calc-table"><thead><tr><th scope="col">Test date</th><th scope="col">English</th><th scope="col">Math</th><th scope="col">Reading</th><th scope="col">Science</th><th scope="col"><span class="sr">Remove</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<button type="button" class="calc-add" data-act="add-act">+ Add a test date</button>' +
      resultBox(r.error ? [["Superscore", '<span class="calc-err">' + esc(r.error) + "</span>", true]] :
        [["ACT superscore", r.superscore, true], ["Best English", r.english], ["Best Math", r.math], ["Best Reading", r.reading], ["Best Science (not in composite)", r.science == null ? "—" : r.science], ["Best single test", r.bestSingle]],
        "ACT superscore = average of your best English, Math and Reading from any test dates, rounded (.5 up). Science is reported but no longer part of the composite. Colleges set their own superscore policies.");
    return { html: html + (r.error ? "" : collegeActions({ act: r.superscore })), summary: "ACT superscore " + (r.superscore || "—") };
  };

  // ---------------------------------------------------------------- render and events
  let last = null;
  function render() {
    const keep = document.activeElement && root.contains(document.activeElement) && document.activeElement.dataset.k;
    const pos = keep && document.activeElement.selectionStart;
    last = TOOLS[ID]();
    root.innerHTML = last.html + toolbar(last.summary);
    if (keep) {
      const el = root.querySelector('[data-k="' + keep + '"]');
      if (el) { el.focus(); try { if (pos != null && el.setSelectionRange) el.setSelectionRange(pos, pos); } catch (e) {} }
    }
  }
  function setPath(obj, path, value) {
    const parts = path.split(".");
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }
  function getPath(obj, path) { return path.split(".").reduce((o, k) => o[k], obj); }

  let typingSnapshot = null;
  root.addEventListener("focusin", (e) => { if (e.target.dataset.k) typingSnapshot = clone(S); });
  root.addEventListener("input", (e) => {
    const k = e.target.dataset.k; if (!k) return;
    if (typingSnapshot) { undo.push(typingSnapshot); typingSnapshot = null; }
    setPath(S, k, e.target.type === "checkbox" ? e.target.checked : e.target.value);
    persist(); render();
  });
  root.addEventListener("change", (e) => {
    if (e.target.dataset.act === "remember") { remember = e.target.checked; persist(); return; }
    const k = e.target.dataset.k; if (!k || e.target.tagName === "INPUT" && e.target.type !== "checkbox") return;
    commit((s) => setPath(s, k, e.target.type === "checkbox" ? e.target.checked : e.target.value));
  });
  root.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches("[data-policy]")) S.policyOpen = e.target.open; }, true);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "INPUT") return;
    const act = b.dataset.act, i = Number(b.dataset.i);
    if (act === "add") commit((s) => getPath(s, b.dataset.path).push(course("", "", ID === "college-gpa" || ID === "cumulative-gpa" ? 3 : 1)));
    else if (act === "del") commit((s) => getPath(s, b.dataset.path).splice(i, 1));
    else if (act === "add-term") commit((s) => s.terms.push({ name: (s.terms.length + 9) + "th grade", courses: [course("", "", 1)] }));
    else if (act === "del-term") commit((s) => s.terms.splice(i, 1));
    else if (act === "add-item") commit((s) => s.items.push({ name: "", earned: "", possible: "" }));
    else if (act === "add-cat") commit((s) => s.cats.push({ name: "New category", weight: "0", dropLowest: "0", items: [] }));
    else if (act === "add-catitem") commit((s) => s.cats[i].items.push({ earned: "", possible: "" }));
    else if (act === "add-part") commit((s) => s.parts.push({ name: "Part", weight: "0", grade: "" }));
    else if (act === "add-scenario") commit((s) => s.scenarios.push({ name: "Scenario " + (s.scenarios.length + 1), gpa: "3.5" }));
    else if (act === "add-sat") commit((s) => s.attempts.push({ label: "", rw: "", math: "" }));
    else if (act === "add-act") commit((s) => s.attempts.push({ label: "", english: "", math: "", reading: "", science: "" }));
    else if (act === "undo") { if (undo.length) { S = undo.pop(); persist(); render(); } }
    else if (act === "reset") commit((s) => { Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, clone(DEFAULTS[ID])); });
    else if (act === "copy") {
      const text = last.summary + " (FunSAT " + location.pathname + ")";
      const done = () => { const el = root.querySelector(".calc-copied"); if (el) el.textContent = "Copied"; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
    } else if (act === "profile-gpa" || act === "profile-sat" || act === "profile-act") {
      const fields = {};
      if (act === "profile-gpa") {
        const m = b.closest(".calc-next").querySelector("a.calc-btn").getAttribute("href");
        const p = new URLSearchParams(m.split("?")[1]);
        fields.gpa = Number(p.get("gpa")); fields.gpaScale = p.get("scale") || "4uw";
      } else {
        const p = new URLSearchParams(b.closest(".calc-next").querySelector("a.calc-btn").getAttribute("href").split("?")[1]);
        if (act === "profile-sat") { fields.sat = Number(p.get("sat")); fields.testType = "sat"; }
        else { fields.act = Number(p.get("act")); fields.testType = "act"; }
      }
      const ok = saveToProfile(fields);
      b.textContent = ok ? "Saved to your profile on this device" : "Could not save (storage is blocked)";
    }
  });

  render();
})();
