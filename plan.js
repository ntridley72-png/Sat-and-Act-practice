/* Plan screen: score history, a goal, College Board / ACT report import, and a study plan.
   Reports are read in the browser and only the numbers the student confirms are kept
   (profile.scoreReports). The PDF, the name and any student ID are never stored or sent. */
(function () {
  "use strict";
  const $id = (x) => document.getElementById(x);
  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const P = window.FunSATPlan, R = window.FunSATReport;
  if (!P || !R) return;

  const ui = { test: "sat", draft: null, notice: null, busy: false, coachBusy: false, coachErr: "", openWeek: 1 };
  const SAT_DOMAINS = [].concat(R.SAT_DOMAINS.rw, R.SAT_DOMAINS.math);
  const ACT_KEYS = [["english", "English"], ["math", "Math"], ["reading", "Reading"], ["science", "Science"]];
  const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const fmtDate = (iso) => { const t = Date.parse((iso || "") + "T00:00:00Z"); return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "No date"; };

  // ---- stored data ----
  const store = () => {
    if (!Array.isArray(profile.scoreReports)) profile.scoreReports = [];
    if (!profile.studyPlan || typeof profile.studyPlan !== "object" || Array.isArray(profile.studyPlan)) profile.studyPlan = {};
    const sp = profile.studyPlan;
    if (!sp.goals || typeof sp.goals !== "object") sp.goals = {};
    if (!Number.isFinite(sp.minutes)) sp.minutes = 180;
    return sp;
  };
  function goalFor(test) {
    const sp = store();
    const g = sp.goals[test] || {};
    let total = Number.isFinite(g.total) ? g.total : null;
    // The SAT goal is the same number as the "Personal SAT target" in College.
    if (test === "sat" && total == null && profile.college && Number.isFinite(profile.college.customTarget)) total = profile.college.customTarget;
    return { total, date: g.date || "" };
  }
  function setGoal(test, patch) {
    const sp = store();
    sp.goals[test] = Object.assign({}, sp.goals[test], patch);
    if (test === "sat" && "total" in patch && Number.isFinite(patch.total)) {
      if (!profile.college || typeof profile.college !== "object" || Array.isArray(profile.college)) profile.college = {};
      profile.college.customTarget = patch.total;
    }
    persist();
  }
  function persist() { try { saveProfile(); } catch (e) { /* the screen still works without storage */ } }

  // ---- practice results already on the device ----
  function practicePoints(test) {
    const out = [];
    (profile.history || []).forEach((r) => {
      if (!r || !r.done || r.scoreEligible === false || r.practiceKind === "topic" || (r.testType === "act" ? "act" : "sat") !== test) return;
      const at = r.finishedAt || r.startedAt || r.at; if (!at) return;
      const s = r.secScores || {};
      let total = null;
      if (test === "sat" && s.rw && s.math && Number.isFinite(s.rw.score) && Number.isFinite(s.math.score)) total = s.rw.score + s.math.score;
      if (test === "act" && s.english && s.math && s.reading && [s.english, s.math, s.reading].every((x) => Number.isFinite(x.score))) total = Math.round((s.english.score + s.math.score + s.reading.score) / 3);
      if (total == null) return;
      const d = new Date(at);
      out.push({ date: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"), value: total, kind: "practice" });
    });
    return out;
  }
  function practiceNow() {
    let p = null; try { p = predictScores(); } catch (e) { return {}; }
    const o = {};
    if (p.sat && p.sat.total) o.sat = { total: p.sat.total.point, rw: p.sat.rw && p.sat.rw.point, math: p.sat.math && p.sat.math.point };
    if (p.act && p.act.composite) o.act = { total: p.act.composite.point, english: p.act.english && p.act.english.point, math: p.act.math && p.act.math.point, reading: p.act.reading && p.act.reading.point, science: p.act.science && p.act.science.point };
    return o;
  }
  function skillRows() {
    const inv = window.FunSATSubjects ? window.FunSATSubjects.inventory() : {};
    const stats = profile.skillStats || {};
    return Object.values(inv).map((x) => { const s = stats[x.key] || {}; return { key: x.key, test: x.test, section: x.section, domain: x.domain, skill: x.skill, pool: x.ids.length, r: s.r || 0, w: s.w || 0 }; });
  }
  function currentPlan() {
    const sp = store();
    return P.buildPlan({ today: todayIso(), test: ui.test, goal: goalFor(ui.test), minutesPerWeek: sp.minutes, reports: profile.scoreReports, practice: practiceNow(), skills: skillRows() });
  }

  // ---- history chart ----
  function historyPoints(test) {
    const off = profile.scoreReports.filter((r) => r && r.kind === test && Number.isFinite(r.total) && typeof r.date === "string" && r.date).map((r) => ({ date: r.date, value: r.total, kind: "official", id: r.id }));
    return off.concat(practicePoints(test)).sort((a, b) => a.date.localeCompare(b.date));
  }
  function chartSvg(points, goal, test) {
    if (!points.length) return "";
    const W = 560, H = 190, L = 44, Rr = 14, T = 12, B = 26;
    const vals = points.map((p) => p.value).concat(goal.total ? [goal.total] : []);
    const lo0 = Math.min(...vals), hi0 = Math.max(...vals);
    const step = test === "sat" ? 100 : 2;
    let lo = Math.floor((lo0 - step * 0.4) / step) * step, hi = Math.ceil((hi0 + step * 0.4) / step) * step;
    if (test === "sat") { lo = Math.max(400, lo); hi = Math.min(1600, hi); } else { lo = Math.max(1, lo); hi = Math.min(36, hi); }
    if (hi - lo < step) hi = lo + step;
    const t0 = Date.parse(points[0].date + "T00:00:00Z"), t1 = Date.parse(points[points.length - 1].date + "T00:00:00Z");
    const x = (d) => (t1 === t0 ? (L + (W - Rr)) / 2 : L + ((Date.parse(d + "T00:00:00Z") - t0) / (t1 - t0)) * (W - Rr - L));
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let g = "";
    for (let v = lo; v <= hi + 0.001; v += step) g += '<line class="pl-grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="pl-axis" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>";
    const goalLine = goal.total && goal.total >= lo && goal.total <= hi ? '<line class="pl-goal" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(goal.total) + '" y2="' + y(goal.total) + '"/><text class="pl-goal-t" x="' + (W - Rr) + '" y="' + (y(goal.total) - 5) + '" text-anchor="end">Goal ' + goal.total + "</text>" : "";
    const line = (kind) => { const pts = points.filter((p) => p.kind === kind); return pts.length > 1 ? '<polyline class="pl-line ' + kind + '" points="' + pts.map((p) => x(p.date) + "," + y(p.value)).join(" ") + '"/>' : ""; };
    const dots = points.map((p) => '<circle class="pl-dot ' + p.kind + '" cx="' + x(p.date) + '" cy="' + y(p.value) + '" r="5"><title>' + esc(fmtDate(p.date) + ": " + p.value + (p.kind === "official" ? " (official)" : " (practice)")) + "</title></circle>").join("");
    const lbl = [points[0], points[points.length - 1]].filter((p, i, a) => i === 0 || p !== a[0]).map((p, i, a) => '<text class="pl-axis" x="' + x(p.date) + '" y="' + (H - 6) + '" text-anchor="' + (a.length === 1 ? "middle" : i === 0 ? "start" : "end") + '">' + esc(fmtDate(p.date)) + "</text>").join("");
    return '<svg class="pl-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Score history: ' + points.length + " score" + (points.length === 1 ? "" : "s") + (goal.total ? ", goal " + goal.total : "") + '">' + g + goalLine + line("practice") + line("official") + dots + lbl + "</svg>";
  }

  // ---- report form ----
  function blankDraft(kind, source) { return { kind, date: todayIso(), total: "", sections: {}, domains: {}, source: source || "manual", warnings: [], found: [] }; }
  function draftFromParse(parsed, source) {
    const d = blankDraft(parsed.kind || ui.test, source);
    d.date = parsed.date || todayIso(); d.dateFound = !!parsed.date;
    d.total = parsed.total != null ? String(parsed.total) : "";
    Object.keys(parsed.sections || {}).forEach((k) => { if (parsed.sections[k] != null) d.sections[k] = String(parsed.sections[k]); });
    Object.keys(parsed.domains || {}).forEach((k) => { d.domains[k] = String(parsed.domains[k]); });
    d.warnings = parsed.warnings || [];
    d.percentile = parsed.percentile;
    return d;
  }
  function validateDraft(d) {
    const errs = [];
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const total = num(d.total);
    if (d.kind === "sat") {
      if (total == null || !Number.isInteger(total) || total < 400 || total > 1600 || total % 10) errs.push("Total score must be between 400 and 1600, in steps of 10.");
      ["rw", "math"].forEach((k) => { const v = num(d.sections[k]); if (v != null && (!Number.isInteger(v) || v < 200 || v > 800 || v % 10)) errs.push((k === "rw" ? "Reading & Writing" : "Math") + " must be between 200 and 800, in steps of 10."); });
      const a = num(d.sections.rw), b = num(d.sections.math);
      if (total != null && a != null && b != null && a + b !== total) errs.push("The two section scores should add up to the total (" + (a + b) + " vs " + total + ").");
    } else {
      if (total == null || !Number.isInteger(total) || total < 1 || total > 36) errs.push("Composite must be a whole number from 1 to 36.");
      ACT_KEYS.forEach(([k, label]) => { const v = num(d.sections[k]); if (v != null && (!Number.isInteger(v) || v < 1 || v > 36)) errs.push(label + " must be a whole number from 1 to 36."); });
    }
    const t = Date.parse(d.date + "T00:00:00Z");
    if (!Number.isFinite(t)) errs.push("Choose the test date.");
    else if (t > Date.now() + 366 * 86400000) errs.push("That test date is too far in the future.");
    return errs;
  }
  function saveDraft(d) {
    const rec = { id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: d.kind, date: d.date, total: Number(d.total), sections: {}, domains: {}, source: d.source, addedAt: Date.now() };
    Object.keys(d.sections).forEach((k) => { if (d.sections[k] !== "" && d.sections[k] != null) rec.sections[k] = Number(d.sections[k]); });
    Object.keys(d.domains).forEach((k) => { const v = Number(d.domains[k]); if (v >= 1 && v <= 7) rec.domains[k] = v; });
    if (Number.isFinite(d.percentile)) rec.percentile = d.percentile;
    profile.scoreReports = profile.scoreReports.filter((r) => !(r.kind === rec.kind && r.date === rec.date && r.total === rec.total));
    profile.scoreReports.push(rec);
    profile.scoreReports.sort((a, b) => b.date.localeCompare(a.date));
    profile.scoreReports = profile.scoreReports.slice(0, 40);
    persist();
  }

  function draftHtml(d) {
    const v = (x) => esc(x == null ? "" : x);
    const missing = (val, label) => (val === "" || val == null ? ' <span class="pl-miss">not found, enter it</span>' : "");
    const sections = d.kind === "sat"
      ? [["rw", "Reading & Writing"], ["math", "Math"]]
      : ACT_KEYS;
    return '<form class="pl-form" id="plForm" novalidate aria-label="Score report details">' +
      (d.source !== "manual" ? '<p class="pl-info">Here is what we could read. Check each number against your report and fix anything that is off before saving.</p>' : "") +
      (d.warnings && d.warnings.length ? '<ul class="pl-warn">' + d.warnings.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul>" : "") +
      '<div class="pl-row">' +
      '<label>Test<select id="plKind"><option value="sat"' + (d.kind === "sat" ? " selected" : "") + '>SAT</option><option value="act"' + (d.kind === "act" ? " selected" : "") + ">ACT</option></select></label>" +
      '<label>Test date<input type="date" id="plDate" value="' + v(d.date) + '" max="' + new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10) + '">' + (d.source !== "manual" && !d.dateFound ? ' <span class="pl-miss">not found, check it</span>' : "") + "</label>" +
      '<label>' + (d.kind === "sat" ? "Total score" : "Composite") + '<input type="number" inputmode="numeric" id="plTotal" value="' + v(d.total) + '" min="' + (d.kind === "sat" ? 400 : 1) + '" max="' + (d.kind === "sat" ? 1600 : 36) + '" step="' + (d.kind === "sat" ? 10 : 1) + '">' + (d.source !== "manual" ? missing(d.total) : "") + "</label></div>" +
      '<div class="pl-row">' + sections.map(([k, label]) => '<label>' + esc(label) + '<input type="number" inputmode="numeric" data-pl-section="' + k + '" value="' + v(d.sections[k]) + '" min="' + (d.kind === "sat" ? 200 : 1) + '" max="' + (d.kind === "sat" ? 800 : 36) + '" step="' + (d.kind === "sat" ? 10 : 1) + '"></label>').join("") + "</div>" +
      (d.kind === "sat"
        ? '<details class="pl-domains"' + (Object.keys(d.domains).length ? " open" : "") + '><summary>Skill levels from your report (optional)</summary>' +
          '<p class="pl-help">If your report rates each content area, pick the closest level, 1 (lowest) to 7 (highest). Leave any you cannot see blank. These sharpen your plan.</p>' +
          '<div class="pl-dom-grid">' + SAT_DOMAINS.map((name) => '<label>' + esc(name) + '<select data-pl-domain="' + esc(name) + '"><option value="">Not shown</option>' +
            [1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (String(d.domains[name]) === String(n) ? " selected" : "") + ">" + n + (n === 1 ? " (lowest)" : n === 7 ? " (highest)" : "") + "</option>").join("") + "</select></label>").join("") + "</div></details>"
        : "") +
      '<div class="pl-errors" id="plErrors" role="alert" aria-live="assertive"></div>' +
      '<div class="pl-actions"><button type="submit" class="pl-primary">Save to my history</button><button type="button" class="ghost" id="plCancel">Cancel</button></div></form>';
  }

  function readDraftFromForm(d) {
    const host = $id("plForm"); if (!host) return d;
    d.kind = $id("plKind").value; d.date = $id("plDate").value; d.total = $id("plTotal").value;
    d.sections = {}; host.querySelectorAll("[data-pl-section]").forEach((i) => { d.sections[i.dataset.plSection] = i.value; });
    d.domains = {}; host.querySelectorAll("[data-pl-domain]").forEach((s) => { if (s.value) d.domains[s.dataset.plDomain] = s.value; });
    return d;
  }

  // ---- screen ----
  function tile(label, value, sub) { return '<div class="pl-tile"><div class="pl-tl">' + esc(label) + '</div><div class="pl-tv">' + value + "</div>" + (sub ? '<div class="pl-ts">' + sub + "</div>" : "") + "</div>"; }

  function planHtml(plan) {
    const s = plan.summary;
    const sectionName = (k) => P.SECTION_LABEL[k] || k;
    const focusHtml = plan.focus.length
      ? '<ol class="pl-focus">' + plan.focus.map((f) =>
        '<li><div class="pl-fmain"><b>' + esc(f.skill) + '</b><span class="pl-fdom">' + esc(sectionName(f.section) + " · " + f.domain) + "</span>" +
        '<span class="pl-sig">' + esc(f.signals.join(" · ")) + "</span></div>" +
        '<div class="pl-fbtns"><button type="button" class="pl-drill" data-pl-drill="' + esc(f.key) + '" data-n="' + f.drill + '">Drill ' + f.drill + '</button>' +
        '<button type="button" class="ghost pl-ws" data-pl-ws="' + esc(f.key) + '">Worksheet</button></div></li>').join("") + "</ol>"
      : '<p class="pl-muted">No questions are available for this test yet.</p>';
    const weeks = plan.schedule.map((w) => {
      const open = ui.openWeek === w.week ? " open" : "";
      return '<details class="pl-week" data-week="' + w.week + '"' + open + '><summary><b>Week ' + w.week + "</b> · " + esc(w.theme) + ' <span class="pl-muted">' + w.minutes + " min</span></summary><ul>" +
        w.items.map((it) => it.type === "drill"
          ? '<li><button type="button" class="pl-linkbtn" data-pl-drill="' + esc(it.key) + '" data-n="' + it.count + '">Drill ' + it.count + "</button> " + esc(it.skill) + ' <span class="pl-muted">(' + esc(it.domain) + ", about " + it.minutes + " min)</span></li>"
          : "<li>" + esc(it.text) + ' <span class="pl-muted">(about ' + it.minutes + " min)</span></li>").join("") + "</ul></details>";
    }).join("");
    const sp = store();
    const msgs = P.coachMessages(plan);
    const hash = String(msgs[1].content.length) + ":" + msgs[1].content.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    const coach = sp.coach && sp.coach.hash === hash ? sp.coach : null;
    const coachHtml = '<div class="pl-coach"><h3>Coach’s note</h3>' +
      (ui.coachBusy ? '<p class="pl-muted" role="status">Writing your note…</p>'
        : coach ? coach.text.split(/\n{1,}/).filter(Boolean).map((p) => "<p>" + esc(p) + "</p>").join("") + '<p class="pl-muted pl-fine">Written by an AI from the plan above. It can be wrong; your scores and the plan are the source of truth.</p>'
        : '<p class="pl-muted">Get a short, plain-English note on what to focus on and why. Only your scores and skill levels are sent, never your name or your report.</p>') +
      (ui.coachErr ? '<p class="pl-err" role="alert">' + esc(ui.coachErr) + "</p>" : "") +
      '<button type="button" class="secondary" id="plCoach"' + (ui.coachBusy ? " disabled" : "") + ">" + (coach ? "Write a fresh note" : "Write my coach’s note") + "</button></div>";
    return '<div class="pl-pane"><div class="pl-bar">Your focus areas</div><div class="pl-pbody">' +
      (plan.notes.length ? plan.notes.map((n) => '<p class="pl-note">' + esc(n) + "</p>").join("") : "") + focusHtml +
      '<p class="pl-actions-row"><button type="button" class="pl-primary" id="plWorksheet">Make a printable worksheet</button></p></div></div>' +
      '<div class="pl-pane"><div class="pl-bar">Week by week · ' + s.weeks + " week" + (s.weeks === 1 ? "" : "s") + '</div><div class="pl-pbody">' + weeks + "</div></div>" +
      '<div class="pl-pane"><div class="pl-bar">Coach</div><div class="pl-pbody">' + coachHtml + "</div></div>";
  }

  function renderPlanScreen() {
    const host = $id("planBody") || $id("screen-plan"); if (!host) return;
    store();
    const test = ui.test, goal = goalFor(test), plan = currentPlan(), s = plan.summary;
    const pts = historyPoints(test);
    const reports = profile.scoreReports.filter((r) => r.kind === test);
    const unit = test === "sat" ? "" : "";
    const base = s.baseline;
    const gapText = s.gap == null ? "Set a goal" : s.gap > 0 ? "+" + s.gap + " to go" : "Goal reached";
    const trend = (() => {
      const off = pts.filter((p) => p.kind === "official");
      if (off.length < 2) return "";
      const d = off[off.length - 1].value - off[off.length - 2].value;
      return d === 0 ? "No change since your last report" : (d > 0 ? "Up " : "Down ") + Math.abs(d) + " since your last report";
    })();
    const goalMin = test === "sat" ? 400 : 1, goalMax = test === "sat" ? 1600 : 36;

    host.innerHTML =
      '<header class="pl-head"><div class="st-kicker">Plan · history, goal and what to work on</div>' +
      '<h1>Your plan to a better score</h1>' +
      '<p class="small muted">Add your past scores, set a goal, and get a plan built from your own weak spots. Everything stays on this device unless you sign in.</p></header>' +
      '<div class="subject-tabs pl-tabs" role="tablist" aria-label="Test">' + ["sat", "act"].map((t) => '<button type="button" role="tab" aria-selected="' + (ui.test === t) + '" class="subject-tab' + (ui.test === t ? " active" : "") + '" data-pl-test="' + t + '">' + t.toUpperCase() + "</button>").join("") + "</div>" +
      '<div class="pl-grid2">' +
      '<div class="pl-col">' +
      '<div class="pl-pane"><div class="pl-bar">Where you are</div><div class="pl-pbody">' +
      '<div class="pl-tiles">' +
        tile(base && base.source === "official" ? "Latest official score" : "Practice estimate", base ? "<b>" + base.value + "</b>" : "<b>—</b>", base ? (base.date ? esc(fmtDate(base.date)) : "From your practice tests") + (trend ? "<br>" + esc(trend) : "") : "Add a report or finish a practice test") +
        tile("Goal", goal.total ? "<b>" + goal.total + "</b>" : "<b>—</b>", esc(gapText)) +
      "</div>" +
      '<div class="pl-row pl-goalrow">' +
      '<label>Goal ' + (test === "sat" ? "total" : "composite") + '<input type="number" inputmode="numeric" id="plGoal" min="' + goalMin + '" max="' + goalMax + '" step="' + (test === "sat" ? 10 : 1) + '" value="' + (goal.total || "") + '" placeholder="' + (test === "sat" ? "e.g. 1400" : "e.g. 28") + '"></label>' +
      '<label>Test date (optional)<input type="date" id="plGoalDate" value="' + esc(goal.date) + '"></label>' +
      '<label>Study time<select id="plMinutes">' + [90, 120, 180, 240, 300, 360].map((m) => '<option value="' + m + '"' + (store().minutes === m ? " selected" : "") + ">" + (m / 60) + " hours a week</option>").join("") + "</select></label></div>" +
      '<div class="pl-errors" id="plGoalErr" role="alert" aria-live="polite"></div>' +
      "</div></div>" +
      (window.FunSATHabits ? window.FunSATHabits.planHtml() : "") +
      '<div class="pl-pane"><div class="pl-bar">Score history</div><div class="pl-pbody">' +
      (pts.length ? chartSvg(pts, goal, test) + '<p class="pl-legend"><span class="pl-key official"></span> Official report <span class="pl-key practice"></span> Practice test <span class="pl-key goal"></span> Goal</p>'
        : '<p class="pl-muted">No scores yet. Add a score report below, or finish a full practice test and it will appear here.</p>') +
      (reports.length ? '<ul class="pl-list">' + reports.map((r) =>
        '<li><span class="pl-ld">' + esc(fmtDate(r.date)) + '</span><span class="pl-lt"><b>' + esc(r.total) + "</b>" + (test === "sat" && r.sections && (r.sections.rw || r.sections.math) ? ' <span class="pl-muted">RW ' + (r.sections.rw || "—") + " · Math " + (r.sections.math || "—") + "</span>" : test === "act" && r.sections ? ' <span class="pl-muted">' + ACT_KEYS.filter(([k]) => r.sections[k]).map(([k, l]) => l.slice(0, 3) + " " + r.sections[k]).join(" · ") + "</span>" : "") +
        (r.domains && Object.keys(r.domains).length ? ' <span class="pl-tag">skill levels</span>' : "") + '</span><button type="button" class="ghost pl-del" data-pl-del="' + esc(r.id) + '" aria-label="Delete the ' + esc(fmtDate(r.date)) + ' report">Delete</button></li>').join("") + "</ul>" : "") +
      "</div></div>" +
      '<div class="pl-pane" id="plImport"><div class="pl-bar">Add a score report</div><div class="pl-pbody">' +
      (ui.draft ? draftHtml(ui.draft) :
        '<p class="pl-help">Download your report from your College Board (or ACT) account and add the PDF here. It is read on this device and never uploaded. We keep only the scores you confirm, not your name or ID.</p>' +
        '<div class="pl-drop"><label class="pl-file"><input type="file" id="plFile" accept="application/pdf,.pdf"><span class="pl-primary pl-filebtn" role="button" tabindex="-1">Choose a PDF report</span></label>' +
        '<button type="button" class="secondary" id="plManual">Type my scores instead</button></div>' +
        '<details class="pl-paste"><summary>Or paste the text from your online score report</summary><textarea id="plPaste" rows="4" placeholder="Paste your score summary here"></textarea><button type="button" class="secondary" id="plPasteGo">Read it</button></details>') +
      (ui.busy ? '<p class="pl-muted" role="status">Reading your report…</p>' : "") +
      (ui.notice ? '<p class="pl-notice" role="status">' + esc(ui.notice) + "</p>" : "") +
      "</div></div>" +
      "</div>" +
      '<div class="pl-col">' + planHtml(plan) + "</div></div>";
    wirePlan(plan);
    if (window.FunSatAds) window.FunSatAds.mount();
  }

  function wirePlan(plan) {
    const host = $id("screen-plan"); if (!host) return;
    host.querySelectorAll("[data-pl-test]").forEach((b) => b.addEventListener("click", () => { ui.test = b.dataset.plTest; ui.draft = null; ui.notice = null; ui.coachErr = ""; renderPlanScreen(); }));
    const goal = $id("plGoal"), date = $id("plGoalDate"), mins = $id("plMinutes"), gerr = $id("plGoalErr");
    const commitGoal = () => {
      const v = goal.value === "" ? null : Number(goal.value);
      const okSat = ui.test === "sat" ? Number.isInteger(v) && v >= 400 && v <= 1600 && v % 10 === 0 : Number.isInteger(v) && v >= 1 && v <= 36;
      if (v != null && !okSat) { gerr.textContent = ui.test === "sat" ? "A goal is 400 to 1600, in steps of 10." : "A goal is a whole number from 1 to 36."; return; }
      gerr.textContent = "";
      const patch = { date: date.value || "" }; if (v != null) patch.total = v;
      setGoal(ui.test, patch); renderPlanScreen();
    };
    if (goal) { goal.addEventListener("change", commitGoal); date.addEventListener("change", commitGoal); }
    if (mins) mins.addEventListener("change", () => { store().minutes = Number(mins.value) || 180; persist(); renderPlanScreen(); });
    host.querySelectorAll("[data-pl-del]").forEach((b) => b.addEventListener("click", () => {
      profile.scoreReports = profile.scoreReports.filter((r) => r.id !== b.dataset.plDel); persist(); ui.notice = "Report deleted."; renderPlanScreen();
    }));
    const file = $id("plFile");
    if (file) file.addEventListener("change", async () => {
      const f = file.files && file.files[0]; if (!f) return;
      ui.busy = true; ui.notice = null; renderPlanScreen();
      try {
        const parsed = await R.parseReportFile(f);
        ui.busy = false;
        if (!parsed.found) { ui.draft = blankDraft(ui.test, "manual"); ui.notice = "We opened the PDF but could not find any scores in it. Type them in below instead."; }
        else { ui.draft = draftFromParse(parsed, "pdf"); }
      } catch (e) { ui.busy = false; ui.notice = (e && e.message ? e.message : "That file could not be read.") + " You can type your scores in instead."; ui.draft = null; }
      renderPlanScreen();
      const h = $id("plImport"); if (h && h.scrollIntoView) h.scrollIntoView({ block: "nearest" });
    });
    const man = $id("plManual"); if (man) man.addEventListener("click", () => { ui.draft = blankDraft(ui.test, "manual"); ui.notice = null; renderPlanScreen(); const f = $id("plTotal"); if (f) f.focus(); });
    const pasteGo = $id("plPasteGo");
    if (pasteGo) pasteGo.addEventListener("click", () => {
      const parsed = R.parseReportText($id("plPaste").value);
      if (!parsed.found) { ui.notice = "We could not find any scores in that text. Try typing them in."; renderPlanScreen(); return; }
      ui.draft = draftFromParse(parsed, "paste"); ui.notice = null; renderPlanScreen();
    });
    const form = $id("plForm");
    if (form) {
      $id("plKind").addEventListener("change", () => { ui.draft = readDraftFromForm(ui.draft); ui.test = ui.draft.kind; ui.draft.sections = {}; ui.draft.domains = {}; renderPlanScreen(); });
      $id("plCancel").addEventListener("click", () => { ui.draft = null; renderPlanScreen(); });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const d = readDraftFromForm(ui.draft), errs = validateDraft(d);
        const box = $id("plErrors");
        if (errs.length) { box.innerHTML = "<ul>" + errs.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>"; return; }
        saveDraft(d); ui.test = d.kind; ui.draft = null; ui.notice = "Saved. Your plan now uses this report."; ui.coachErr = "";
        renderPlanScreen();
      });
    }
    host.querySelectorAll("[data-pl-drill]").forEach((b) => b.addEventListener("click", () => { if (window.FunSATSubjects) window.FunSATSubjects.start(b.dataset.plDrill, Number(b.dataset.n) || 10); }));
    host.querySelectorAll("[data-pl-ws]").forEach((b) => b.addEventListener("click", () => { if (window.FunSATWorksheet) window.FunSATWorksheet.open({ keys: [b.dataset.plWs], test: ui.test }); }));
    const wsBtn = $id("plWorksheet");
    if (wsBtn) wsBtn.addEventListener("click", () => { if (window.FunSATWorksheet) window.FunSATWorksheet.open({ keys: plan.focus.slice(0, 3).map((f) => f.key), test: ui.test }); });
    host.querySelectorAll(".pl-week").forEach((d) => d.addEventListener("toggle", () => { if (d.open) ui.openWeek = Number(d.dataset.week); }));
    if (window.FunSATHabits) window.FunSATHabits.wirePlan(host);
    const coach = $id("plCoach"); if (coach) coach.addEventListener("click", () => askCoach(plan));
  }

  async function askCoach(plan) {
    if (ui.coachBusy || typeof aiChat !== "function") return;
    ui.coachBusy = true; ui.coachErr = ""; renderPlanScreen();
    const msgs = P.coachMessages(plan);
    try {
      const text = String(await aiChat(msgs)).trim();
      if (!text) throw { code: "empty" };
      const hash = String(msgs[1].content.length) + ":" + msgs[1].content.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
      store().coach = { hash, text: text.slice(0, 1800), at: Date.now() }; persist();
    } catch (e) { ui.coachErr = typeof aiErrorText === "function" ? aiErrorText(e) : "The coach is not available right now. Your plan above still works."; }
    ui.coachBusy = false; renderPlanScreen();
  }

  function openPlan() {
    state.view = "plan";
    render();
    try { scrollTo(0, 0); } catch (e) { /* ignore */ }
  }

  const baseRender = render;
  render = function () {
    if (state.view === "plan") { showScreen("screen-plan"); renderPlanScreen(); return; }
    baseRender();
  };
  const btn = $id("btnPlan"); if (btn) btn.addEventListener("click", openPlan);
  window.FunSATPlanScreen = { open: openPlan, render: renderPlanScreen, state: ui };
})();
