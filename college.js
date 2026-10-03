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
  function gpaOn4(c) {
    if (!Number.isFinite(c.gpa) || c.gpa <= 0) return null;
    if (c.gpaScale === "100") return Math.max(0, Math.min(4, (c.gpa - 60) / 10));
    if (c.gpaScale === "5w") return Math.max(0, Math.min(4, c.gpa * 0.8));
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

    let scoreDelta = 0;
    if (range && score) {
      const span = Math.max(1, range.hi - range.lo);
      const pos = (score.value - range.lo) / span;
      const z = clamp((pos - 0.5) * 2.2, -2.2, 2.2);
      scoreDelta = 0.85 * z;
      const where = score.value >= range.hi ? "at or above the 75th percentile" : score.value <= range.lo ? "below the 25th percentile" : Math.round(pos * 100) + "% of the way across the middle range";
      factors.push({ label: testType.toUpperCase() + " score", detail: "Your " + score.value + (score.converted ? " (converted from your other test)" : "") + " is " + where + " (" + range.lo + "–" + range.hi + ").", effect: scoreDelta > 0.15 ? "up" : scoreDelta < -0.15 ? "down" : "even" });
    } else {
      factors.push({ label: testType.toUpperCase() + " score", detail: "Add your score to include test-position in the estimate.", effect: "missing" });
    }
    logit += scoreDelta;

    const gpa4 = gpaOn4(c);
    let gpaDelta = 0;
    if (gpa4 != null) {
      const bench = expectedGpa(college.adm);
      gpaDelta = 0.55 * clamp((gpa4 - bench) / 0.25, -2, 2);
      factors.push({ label: "GPA", detail: "Your " + gpa4.toFixed(2) + " on a 4.0 scale compared with an app benchmark of about " + bench.toFixed(1) + " for a college admitting " + college.adm + "%.", effect: gpaDelta > 0.12 ? "up" : gpaDelta < -0.12 ? "down" : "even" });
    } else {
      factors.push({ label: "GPA", detail: "Add your GPA to include academic performance in the estimate.", effect: "missing" });
    }
    logit += gpaDelta;

    const rigor = rigorStrength(c);
    logit += rigor;
    if (rigor > 0) factors.push({ label: "Course rigor", detail: "AP/IB/honors/dual-enrollment coursework adds a small readiness signal.", effect: "up" });

    const activity = activityStrength(c);
    logit += activity;
    if (activity > 0) factors.push({ label: "Activities", detail: "Sustained involvement and leadership add a small holistic signal.", effect: "up" });

    const circ = circumstanceStrength(c);
    logit += circ;
    if (circ > 0) factors.push({ label: "Context", detail: "First-generation status, work, caregiving, and hardship are treated as context, not as score boosts. Colleges review them individually.", effect: "context" });

    if (c.major) factors.push({ label: "Intended major", detail: "Some majors (for example computer science, engineering, nursing, and business) can be more competitive at a given college. This estimate does not adjust for major because colleges do not publish comparable major-level admit rates.", effect: "context" });

    if (c.applyPlan === "early") {
      logit += 0.22;
      factors.push({ label: "Early application", detail: "You selected ED/EA. Many colleges report higher early admit rates, but the size of the benefit varies and this app does not have per-college early data, so the weight is deliberately small.", effect: "up" });
    }
    if (c.appStrength === "strong") {
      logit += 0.18;
      factors.push({ label: "Essays and recommendations", detail: "You rated these strong. Self-reported holistic factors get a small, bounded weight; colleges review them in context.", effect: "up" });
    } else if (c.appStrength === "developing") {
      logit -= 0.18;
      factors.push({ label: "Essays and recommendations", detail: "You rated these as still developing. This is self-reported and gets a small, bounded weight.", effect: "down" });
    }

    const estimate = clamp(sigmoid(logit), 0.005, 0.97);
    let half = 0.06;
    if (!range || !score) half += 0.05;
    if (gpa4 == null) half += 0.04;
    if (c.grade === "9" || c.grade === "10") half += 0.03;
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

  function pieHtml(est) {
    const R = 66, r = 40, C = 80;
    const slices = [
      { label: "Accept", value: est.estimate, color: "#2bc48a" },
      { label: "Waitlist", value: est.waitlist, color: "#ffcc4d" },
      { label: "Deny", value: est.deny, color: "#ef4444" },
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
  function matches(college, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
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
        const where = est.range && est.score ? (est.score.value >= est.range.hi ? "above 75th" : est.score.value <= est.range.lo ? "below 25th" : "inside middle 50%") : "add your score";
        return '<li><button type="button" class="college-saved-item' + (x.id === selectedId ? " current" : "") + '" data-select="' + x.id + '" title="Open ' + escapeHtml(x.n) + '">' +
          '<span class="cs-name">' + escapeHtml(x.n) + '</span><span class="small muted">' + x.st + " · admits " + x.adm + "% · " + where + '</span><span class="cs-est">' + pct(est.estimate) + " est. accept</span></button>" +
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
      '<fieldset><legend>Test scores</legend>' +
      '<label>Primary test <select id="collegeTestType"><option value="sat"' + (c.testType === "sat" ? " selected" : "") + '>SAT</option><option value="act"' + (c.testType === "act" ? " selected" : "") + ">ACT</option></select></label>" +
      '<label>SAT total (400–1600) <input type="number" id="collegeSat" min="400" max="1600" step="10" value="' + (c.sat != null ? c.sat : "") + '" placeholder="e.g., 1350"></label>' +
      '<label>ACT composite (1–36) <input type="number" id="collegeAct" min="1" max="36" step="1" value="' + (c.act != null ? c.act : "") + '" placeholder="e.g., 30"></label>' +
      (predSat || predAct ? '<button type="button" class="secondary" id="collegeUsePredicted">Use my predicted score' + (predSat ? " (SAT " + predSat + ")" : predAct ? " (ACT " + predAct + ")" : "") + "</button>" : "") +
      '<p class="small muted">Enter your best official or practice score. Predicted scores come from your practice attempts and are estimates.</p></fieldset>' +
      '<fieldset><legend>Academics</legend>' +
      '<label>Grade level <select id="collegeGrade">' + [["9", "9th"], ["10", "10th"], ["11", "11th"], ["12", "12th"], ["gap", "Gap year / other"]].map(([v, t]) => '<option value="' + v + '"' + (c.grade === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" +
      '<label>GPA <input type="number" id="collegeGpa" min="0" max="100" step="0.01" value="' + (c.gpa != null ? c.gpa : "") + '" placeholder="e.g., 3.85"></label>' +
      '<label>GPA scale <select id="collegeGpaScale">' + [["4uw", "4.0 unweighted"], ["4w", "4.0 weighted"], ["5w", "5.0 weighted"], ["100", "100-point"]].map(([v, t]) => '<option value="' + v + '"' + (c.gpaScale === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" +
      '<label>Intended major <input type="text" id="collegeMajor" maxlength="80" value="' + escapeHtml(c.major || "") + '" placeholder="e.g., Computer science"></label>' +
      '<label>Application plan <select id="collegeApplyPlan"><option value="regular"' + (c.applyPlan !== "early" ? " selected" : "") + '>Regular decision</option><option value="early"' + (c.applyPlan === "early" ? " selected" : "") + '>Early (ED/EA)</option></select></label>' +
      '<label>Essays &amp; recs (self-rated) <select id="collegeAppStrength"><option value="strong"' + (c.appStrength === "strong" ? " selected" : "") + '>Strong</option><option value="average"' + (c.appStrength !== "strong" && c.appStrength !== "developing" ? " selected" : "") + '>Average</option><option value="developing"' + (c.appStrength === "developing" ? " selected" : "") + '>Still developing</option></select></label>' +
      '<div class="college-rigor"><span>Course rigor (count of courses)</span>' +
      ["ap", "ib", "honors", "dual"].map((k) => '<label>' + ({ ap: "AP", ib: "IB", honors: "Honors", dual: "Dual enrollment" })[k] + ' <input type="number" min="0" max="40" step="1" data-rigor="' + k + '" value="' + (Number(c.rigor[k]) || 0) + '"></label>').join("") + "</div></fieldset>" +
      '<fieldset class="college-wide"><legend>Activities and circumstances</legend>' +
      '<div class="college-activities" id="collegeActivities">' + activityRows + "</div>" +
      '<button type="button" class="secondary" id="collegeAddActivity">+ Add activity</button>' +
      '<div class="college-checks">' +
      '<label class="college-check"><input type="checkbox" id="collegeFirstGen"' + (c.firstGen ? " checked" : "") + "> First-generation college student</label>" +
      '<label class="college-check"><input type="checkbox" id="collegeHardship"' + (c.hardship ? " checked" : "") + "> Financial hardship</label>" +
      '<label class="college-check"><input type="checkbox" id="collegeWorking"' + (c.working ? " checked" : "") + "> Working during school</label>" +
      '<label class="college-check"><input type="checkbox" id="collegeCaregiving"' + (c.caregiving ? " checked" : "") + "> Caregiving responsibilities</label></div>" +
      '<label>Other context (optional) <textarea id="collegeOther" rows="2" maxlength="500" placeholder="Anything else colleges should know">' + escapeHtml(c.circumstanceOther || "") + "</textarea></label>" +
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
        '<div class="college-equation-row"><code>score position = (' + score.value + ' - ' + range.lo + ') / (' + range.hi + ' - ' + range.lo + ') = ' + (Math.round(pos * 100) / 100).toFixed(2) + '</code><button type="button" class="secondary" data-copy-equation="score position = (' + score.value + ' - ' + range.lo + ') / (' + range.hi + ' - ' + range.lo + ') = ' + (Math.round(pos * 100) / 100).toFixed(2) + '">Copy equation</button></div>' +
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
      '<div><span class="college-stat-num">' + (range && range.mid != null ? range.mid : "—") + '</span><span class="small muted">reported median (' + est.testType.toUpperCase() + ')</span></div></div>' +
      '<div class="college-target"><div class="college-target-head"><strong>Score goal</strong><span class="small muted">Default: 75th percentile (adjustable)</span></div>' +
      '<div class="college-target-btns" role="group" aria-label="Target score">' +
      '<button type="button" class="secondary' + (c.targetMode === "p75" ? " on" : "") + '" data-target="p75">75th percentile</button>' +
      '<button type="button" class="secondary' + (c.targetMode === "mid" ? " on" : "") + '" data-target="mid">Above midrange</button>' +
      '<button type="button" class="secondary' + (c.targetMode === "custom" ? " on" : "") + '" data-target="custom">Custom</button>' +
      (c.targetMode === "custom" ? '<input type="number" id="collegeCustomTarget" min="' + SAT_MIN + '" max="' + SAT_MAX + '" step="10" value="' + (c.customTarget != null ? c.customTarget : "") + '" aria-label="Custom target score">' : "") +
      "</div>" + targetBlock + "</div>" +
      '<div class="college-estimate">' + pieHtml(est) +
      '<div class="college-estimate">' + pieHtml(est) +
      '<div><strong>Estimated outcomes</strong> <span class="college-conf college-conf-' + est.confidence + '">' + est.confidence + ' confidence</span> <span class="small muted">(' + level + ')</span>' +
      '<p class="small muted">Accept, waitlist, and deny shares come from an app model using the factors below. The accept range is ' + pct(est.lo) + ' – ' + pct(est.hi) + '. Waitlist placement is an estimate: it is more common at selective colleges and for borderline applicants, but rarely converts to admission, and some colleges admit none off the waitlist. This is not an admission decision or a guarantee.</p>' +
      (est.confNotes.length ? '<p class="small muted">Improve accuracy: ' + escapeHtml(est.confNotes.join('; ')) + '.</p>' : '') + '</div></div>' +
      '<div class="college-equation-row"><code>estimate = sigmoid(' + "selectivity log-odds" + ' + score + GPA + rigor + activities + context)</code><button type="button" class="secondary" data-copy-equation="estimate = sigmoid(selectivity log-odds + score + GPA + rigor + activities + context)">Copy equation</button></div>' +
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
      '<div id="collegeDetailHost">' + detailHtml() + "</div>" +
      "</div>" + compareHtml() +
      '<p class="small muted college-foot">College data: <a href="' + escapeHtml(CD.meta.sourceUrl || "https://collegescorecard.ed.gov/data/") + '" target="_blank" rel="noopener">College Scorecard</a>, ' + escapeHtml(CD.meta.release || "") + ". " + escapeHtml(CD.meta.note || "") + ' The admissions estimate is an original app model and is not affiliated with any college. <a href="https://www.act.org/content/act/en/products-and-services/the-act/scores/act-sat-concordance.html" target="_blank" rel="noopener">Official ACT/SAT concordance</a>.</p>';
    wireCollege();
    applyPanelSize();
  }

  function selectCollege(id) { selectedId = id; try { renderCollegeScreen(); } catch (e) {} }
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
    const custom = $("collegeCustomTarget");
    if (custom) custom.addEventListener("change", () => { c.customTarget = Number(custom.value) || null; saveCollege(); renderCollegeScreen(); });
    document.querySelectorAll("#screen-college [data-copy-equation]").forEach((b) => b.addEventListener("click", () => copyEquationText(b.dataset.copyEquation, b)));
    const back = $("collegeBack");
    if (back) back.addEventListener("click", closeCollege);

    const bind = (id, key, cast) => { const el = $(id); if (el) el.addEventListener("change", () => { c[key] = cast ? cast(el.value) : el.value; saveCollege(); renderCollegeScreen(); }); };
    bind("collegeTestType", "testType");
    bind("collegeSat", "sat", (v) => (v === "" ? null : clamp(Number(v), SAT_MIN, SAT_MAX)));
    bind("collegeAct", "act", (v) => (v === "" ? null : clamp(Number(v), ACT_MIN, ACT_MAX)));
    bind("collegeGrade", "grade");
    bind("collegeGpa", "gpa", (v) => (v === "" ? null : Number(v)));
    bind("collegeGpaScale", "gpaScale");
    bind("collegeMajor", "major");
    bind("collegeApplyPlan", "applyPlan");
    bind("collegeAppStrength", "appStrength");
    ["collegeFirstGen", "collegeHardship", "collegeWorking", "collegeCaregiving"].forEach((id) => {
      const key = { collegeFirstGen: "firstGen", collegeHardship: "hardship", collegeWorking: "working", collegeCaregiving: "caregiving" }[id];
      const el = $(id);
      if (el) el.addEventListener("change", () => { c[key] = el.checked; saveCollege(); renderCollegeScreen(); });
    });
    const other = $("collegeOther");
    if (other) { other.addEventListener("keydown", (e) => e.stopPropagation()); other.addEventListener("change", () => { c.circumstanceOther = other.value; saveCollege(); renderCollegeScreen(); }); }
    ["collegeMajor", "collegeGpa", "collegeSat", "collegeAct", "collegeOther"].forEach((id) => { const el = $(id); if (el) el.addEventListener("keydown", (e) => e.stopPropagation()); });
    document.querySelectorAll("#screen-college [data-rigor]").forEach((el) => el.addEventListener("change", () => { c.rigor[el.dataset.rigor] = Math.max(0, Number(el.value) || 0); saveCollege(); }));
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
    estimateCollege, selectCollege, open: null, filteredColleges, concordance: { satFromAct, actFromSat },
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
    state.view = collegeReturnView === "test" || collegeReturnView === "routing" ? collegeReturnView : collegeReturnView === "results" ? "results" : "start";
    render();
  }
  window.collegeFeature.open = openCollege;

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
    const save = e.target.closest("[data-save]");
    if (save) { e.preventDefault(); toggleSaved(save.dataset.save); return; }
    const pick = e.target.closest("[data-select]");
    if (pick) { e.preventDefault(); selectCollege(Number(pick.dataset.select)); }
  });
  const startBtn = $("btnCollegeStart");
  if (startBtn) startBtn.addEventListener("click", () => openCollege(""));
  const topBtn = $("btnCollege");
  if (topBtn) topBtn.addEventListener("click", () => openCollege(""));
})();
