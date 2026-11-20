/* Study habits: a spaced-repetition review queue for missed questions, Khan-style skill mastery levels,
   and a daily question goal. The scheduling logic is pure (and unit-tested); the rest wires it to the app.

   Review queue (Leitner boxes). A missed question enters box 1 and is due the next day. Each correct
   answer when it is due moves it up a box (due again in 3, 7, 14, then 30 days); a miss sends it back to
   box 1. A correct answer in box 5 graduates it out of the queue. Answering a question that is not yet due
   never advances it, so seeing it early in a practice test cannot skip the schedule. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.FunSATHabitsCore = api; if (typeof document !== "undefined") api.attach(root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const DAY = 86400000;
  const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]; // index = box
  const LEVELS = [
    { key: "none", label: "Not started" },
    { key: "attempted", label: "Attempted" },
    { key: "familiar", label: "Familiar" },
    { key: "proficient", label: "Proficient" },
    { key: "mastered", label: "Mastered" },
  ];

  /** One answer's effect on a question's queue entry. Returns the new entry, or null when it leaves the queue. */
  function applyResult(entry, correct, now) {
    if (!entry) return correct ? null : { box: 1, due: now + INTERVAL_DAYS[1] * DAY, lapses: 1, last: now };
    if (!correct) return { box: 1, due: now + INTERVAL_DAYS[1] * DAY, lapses: (entry.lapses || 0) + 1, last: now };
    if (entry.due > now) return entry; // not due yet: seeing it early does not advance it
    const box = entry.box + 1;
    if (box > 5) return null; // graduated
    return { box, due: now + INTERVAL_DAYS[box] * DAY, lapses: entry.lapses || 0, last: now };
  }
  function dueIds(srs, now, limit) {
    return Object.keys(srs || {}).filter((id) => srs[id] && srs[id].due <= now).sort((a, b) => srs[a].due - srs[b].due || a.localeCompare(b)).slice(0, limit || 20);
  }
  function counts(srs, now) {
    const ids = Object.keys(srs || {});
    const due = ids.filter((id) => srs[id].due <= now).length;
    const next = ids.filter((id) => srs[id].due > now).map((id) => srs[id].due).sort((a, b) => a - b)[0] || null;
    return { total: ids.length, due, scheduled: ids.length - due, nextDue: next };
  }

  /** Mastery from drill results. Small samples cannot reach the top levels, however lucky. */
  function mastery(r, w) {
    const n = (r || 0) + (w || 0), acc = n ? r / n : 0;
    let i = 0;
    if (n >= 1) i = 1;
    if (n >= 5 && acc >= 0.6) i = 2;
    if (n >= 10 && acc >= 0.8) i = 3;
    if (n >= 20 && acc >= 0.9) i = 4;
    return { index: i, key: LEVELS[i].key, label: LEVELS[i].label, attempts: n, accuracy: n ? Math.round(acc * 100) : null };
  }
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  // ---------------------------------------------------------------- app wiring
  function attach(win) {
    const $id = (x) => document.getElementById(x);
    const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
    if (typeof handleAnswer !== "function" || typeof profile === "undefined") return;

    const store = () => {
      if (!profile.srs || typeof profile.srs !== "object" || Array.isArray(profile.srs)) profile.srs = {};
      if (!profile.dayCounts || typeof profile.dayCounts !== "object" || Array.isArray(profile.dayCounts)) profile.dayCounts = {};
      if (!Number.isFinite(profile.dailyGoal)) profile.dailyGoal = 20;
      return profile;
    };
    const seenThisAttempt = new Set();
    const baseAnswer = handleAnswer;
    handleAnswer = function (choice) {
      let q = null, was = null;
      try { q = byId(currentQids()[state.qi]); } catch (e) { /* ignore */ }
      const first = q && !seenThisAttempt.has(String(state.attemptId) + ":" + q.id);
      const result = baseAnswer.apply(this, arguments);
      if (q && first) {
        seenThisAttempt.add(String(state.attemptId) + ":" + q.id);
        try {
          const p = store(), now = Date.now(), correct = choice === q.ans;
          const next = applyResult(p.srs[q.id], correct, now);
          if (next) p.srs[q.id] = next; else delete p.srs[q.id];
          const k = dayKey(now);
          p.dayCounts[k] = (p.dayCounts[k] || 0) + 1;
          const keep = Object.keys(p.dayCounts).sort().slice(-60);
          Object.keys(p.dayCounts).forEach((d) => { if (keep.indexOf(d) < 0) delete p.dayCounts[d]; });
          saveProfile(); refreshChip();
        } catch (e) { /* the answer itself is already recorded */ }
      }
      return result;
    };

    const API = {
      counts: () => counts(store().srs, Date.now()),
      due: (limit) => dueIds(store().srs, Date.now(), limit).filter((id) => byId(id) && !byId(id).withheld),
      start(limit) {
        const ids = API.due(limit || 20);
        if (!ids.length) return false;
        startCustomSet(ids, "Review queue");
        return true;
      },
      today: () => store().dayCounts[dayKey(Date.now())] || 0,
      goal: () => store().dailyGoal,
      setGoal(n) { store().dailyGoal = Math.max(5, Math.min(200, Math.round(n) || 20)); saveProfile(); refreshChip(); },
      mastery: (r, w) => mastery(r, w),
      levels: LEVELS,
      summary() {
        const inv = win.FunSATSubjects ? win.FunSATSubjects.inventory() : {};
        const stats = profile.skillStats || {};
        const tally = {}; LEVELS.forEach((l) => { tally[l.key] = 0; });
        Object.values(inv).forEach((x) => { const s = stats[x.key] || {}; tally[mastery(s.r, s.w).key]++; });
        return tally;
      },
    };
    win.FunSATHabits = API;

    // ---- the line on the Practice desk
    function fmtNext(t) { const d = Math.ceil((t - Date.now()) / DAY); return d <= 1 ? "tomorrow" : "in " + d + " days"; }
    function refreshChip() {
      const host = document.querySelector("#screen-start .st-head");
      if (!host) return;
      let el = $id("habitChip");
      if (!el) { el = document.createElement("div"); el.id = "habitChip"; el.className = "habit-chip"; host.appendChild(el); }
      const c = API.counts(), today = API.today(), goal = API.goal();
      const pct = Math.min(100, Math.round((today / goal) * 100));
      el.innerHTML =
        '<span class="hb-goal" title="Questions answered today"><span class="hb-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>Today ' + today + " / " + goal + (today >= goal ? " ✓" : "") + "</span>" +
        (c.due ? '<button type="button" class="hb-review" id="hbChipReview">Review ' + Math.min(c.due, 20) + " missed question" + (Math.min(c.due, 20) === 1 ? "" : "s") + "</button>"
          : c.total ? '<span class="hb-muted">' + c.total + " missed question" + (c.total === 1 ? "" : "s") + " scheduled, next " + fmtNext(c.nextDue) + "</span>" : "");
      const b = $id("hbChipReview"); if (b) b.addEventListener("click", () => API.start(20));
    }
    API.refresh = refreshChip;

    // ---- Plan screen section (plan.js calls this)
    API.planHtml = function () {
      const c = API.counts(), today = API.today(), goal = API.goal(), tally = API.summary();
      const pct = Math.min(100, Math.round((today / goal) * 100));
      return '<div class="pl-pane"><div class="pl-bar">Review queue and daily goal</div><div class="pl-pbody">' +
        '<div class="hb-block"><div class="hb-row"><b>Review queue</b><span class="pl-muted">' + (c.total ? c.total + " question" + (c.total === 1 ? "" : "s") + " waiting to come back" : "Nothing yet") + "</span></div>" +
        '<p class="pl-help">Questions you miss return after 1, 3, 7, 14 and 30 days, until you get them right. That is how you keep what you learn.</p>' +
        (c.due ? '<button type="button" class="pl-primary" id="hbPlanReview">Review ' + Math.min(c.due, 20) + " due now</button>" : '<p class="pl-muted">' + (c.total ? "None are due. The next one is due " + fmtNext(c.nextDue) + "." : "Miss a question in practice and it will appear here.") + "</p>") + "</div>" +
        '<div class="hb-block"><div class="hb-row"><b>Daily goal</b><span class="pl-muted">' + today + " of " + goal + " questions today</span></div>" +
        '<div class="hb-track" role="img" aria-label="' + today + " of " + goal + ' questions answered today"><i style="width:' + pct + '%"></i></div>' +
        '<label class="hb-goalsel">Goal<select id="hbGoal">' + [10, 20, 30, 50, 100].map((n) => '<option value="' + n + '"' + (n === goal ? " selected" : "") + ">" + n + " questions a day</option>").join("") + "</select></label></div>" +
        '<div class="hb-block"><div class="hb-row"><b>Skill levels</b><span class="pl-muted">from your subject drills</span></div>' +
        '<ul class="hb-levels">' + LEVELS.map((l) => '<li class="lv-' + l.key + '"><span class="hb-lvdot" aria-hidden="true"></span>' + esc(l.label) + " <b>" + tally[l.key] + "</b></li>").join("") + "</ul></div>" +
        "</div></div>";
    };
    API.wirePlan = function (root) {
      const r = root.querySelector("#hbPlanReview"); if (r) r.addEventListener("click", () => API.start(20));
      const g = root.querySelector("#hbGoal"); if (g) g.addEventListener("change", () => { API.setGoal(Number(g.value)); if (win.FunSATPlanScreen) win.FunSATPlanScreen.render(); });
    };

    const baseStart = typeof renderStart === "function" ? renderStart : null;
    if (baseStart) renderStart = function () { const r = baseStart.apply(this, arguments); try { refreshChip(); } catch (e) { /* ignore */ } return r; };
    try { store(); refreshChip(); } catch (e) { /* ignore */ }
  }

  return { DAY, INTERVAL_DAYS, LEVELS, applyResult, dueIds, counts, mastery, dayKey, attach };
});
