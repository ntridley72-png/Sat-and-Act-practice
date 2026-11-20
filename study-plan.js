/* Study-plan engine. Pure functions: scores, drill accuracy and a goal in, a ranked focus list and a
   week-by-week schedule out. No network, no randomness, so the same inputs always give the same plan.
   The AI "coach's note" only rephrases this plan; it never decides what the plan is. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FunSATPlan = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Share of each SAT section's questions by content domain (College Board digital SAT test specifications).
  const SAT_SHARE = {
    "Information & Ideas": 0.26, "Craft & Structure": 0.28, "Expression of Ideas": 0.20, "Standard English Conventions": 0.26,
    "Algebra": 0.35, "Advanced Math": 0.35, "Problem-Solving & Data Analysis": 0.15, "Geometry & Trigonometry": 0.15,
  };
  const SECTION_LABEL = { rw: "Reading & Writing", math: "Math", english: "English", reading: "Reading", science: "Science" };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const DAY = 86400000;
  const toDay = (iso) => { const t = Date.parse(String(iso || "") + "T00:00:00Z"); return Number.isFinite(t) ? t : null; };

  const bandWeak = (band) => (Number.isFinite(band) ? clamp((7 - band) / 6, 0, 1) : null);
  const accWeak = (r, w) => {
    const n = (r || 0) + (w || 0);
    if (n < 3) return null;
    const acc = ((r || 0) + 0.65 * 4) / (n + 4); // shrink toward 65% so three lucky answers do not read as mastery
    return clamp((0.85 - acc) / 0.6, 0, 1);
  };

  function latest(reports, kind, needDomains) {
    return (reports || [])
      .filter((r) => r && r.kind === kind && (!needDomains || (r.domains && Object.keys(r.domains).length)))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.addedAt || 0) - (a.addedAt || 0))[0] || null;
  }

  function baseline(input, test) {
    const off = latest(input.reports, test);
    const pr = input.practice && input.practice[test];
    if (off && Number.isFinite(off.total)) return { value: off.total, source: "official", date: off.date || null, sections: off.sections || {} };
    if (pr && Number.isFinite(pr.total)) return { value: pr.total, source: "practice", date: null, sections: { rw: pr.rw, math: pr.math, english: pr.english, reading: pr.reading, science: pr.science } };
    return null;
  }

  function buildPlan(input) {
    const test = input.test === "act" ? "act" : "sat";
    const today = toDay(input.today) || Date.now();
    const skills = (input.skills || []).filter((s) => s.test === test);
    const goal = input.goal && Number.isFinite(input.goal.total) ? input.goal : null;
    const base = baseline(input, test);
    const gap = goal && base ? goal.total - base.value : null;
    const minutes = clamp(Math.round(input.minutesPerWeek || 180), 60, 600);
    const notes = [];

    // Domain signals: the latest official report with domain bands, then practice accuracy per domain.
    const domReport = test === "sat" ? latest(input.reports, "sat", true) : null;
    const domPractice = {};
    skills.forEach((s) => { const d = (domPractice[s.domain] = domPractice[s.domain] || { r: 0, w: 0 }); d.r += s.r || 0; d.w += s.w || 0; });

    // How much each section needs, from the section scores against an even split of the goal.
    const sectionKeys = test === "sat" ? ["rw", "math"] : ["english", "math", "reading", "science"];
    const need = {};
    sectionKeys.forEach((k) => { need[k] = 1; });
    if (test === "sat" && goal && base && base.sections && Number.isFinite(base.sections.rw) && Number.isFinite(base.sections.math)) {
      const target = goal.total / 2;
      const room = (k) => Math.max(0, target - base.sections[k]);
      const sum = room("rw") + room("math");
      // 1.0 when both sections need the same amount, up to 1.25 for the one that needs more.
      if (sum > 0) sectionKeys.forEach((k) => { need[k] = 0.75 + 0.5 * (room(k) / sum); });
    }

    const scored = skills.map((s) => {
      const share = test === "sat" ? (SAT_SHARE[s.domain] || 0.2) : 0.25;
      const fromSkill = accWeak(s.r, s.w);
      const bandInfo = domReport && Number.isFinite(domReport.domains[s.domain]) ? domReport.domains[s.domain] : null;
      const fromReport = bandWeak(bandInfo);
      const dp = domPractice[s.domain];
      const fromDomain = dp ? accWeak(dp.r, dp.w) : null;
      const signals = [];
      let weak;
      if (fromSkill != null) {
        weak = fromSkill;
        if (fromReport != null) weak = 0.6 * fromSkill + 0.4 * fromReport;
        signals.push("Drills: " + Math.round((s.r / Math.max(1, s.r + s.w)) * 100) + "% right over " + (s.r + s.w) + " questions");
        if (bandInfo != null) signals.push("Report: " + s.domain + " " + bandInfo + "/7");
      } else if (fromReport != null) {
        weak = fromReport; signals.push("Report: " + s.domain + " " + bandInfo + "/7");
      } else if (fromDomain != null) {
        weak = fromDomain; signals.push("Drills in " + s.domain + ": " + Math.round((dp.r / Math.max(1, dp.r + dp.w)) * 100) + "% right");
      } else {
        weak = 0.4; signals.push("Not measured yet. A drill will tell us.");
      }
      const measured = fromSkill != null || fromReport != null || fromDomain != null;
      const mastered = fromSkill != null && fromSkill < 0.12; // about 78% or better over enough questions
      const priority = weak * (0.4 + 1.2 * share) * (need[s.section] || 1);
      return { key: s.key, section: s.section, sectionLabel: SECTION_LABEL[s.section] || s.section, domain: s.domain, skill: s.skill, pool: s.pool || 0, weak, measured, mastered, priority, signals, share };
    }).filter((s) => s.pool > 0);

    scored.sort((a, b) => b.priority - a.priority || a.skill.localeCompare(b.skill));
    const perDomain = {}, perSection = {};
    const capDomain = test === "sat" ? 2 : 3;
    const focus = [];
    for (const s of scored) {
      if ((perDomain[s.domain] || 0) >= capDomain) continue;
      if ((perSection[s.section] || 0) >= 4) continue;
      if (s.mastered) continue; // a skill you already own is not a focus
      if (s.weak < 0.15 && focus.length >= 3) continue;
      focus.push(s);
      perDomain[s.domain] = (perDomain[s.domain] || 0) + 1;
      perSection[s.section] = (perSection[s.section] || 0) + 1;
      if (focus.length >= 6) break;
    }
    focus.forEach((f) => { f.drill = f.weak >= 0.25 ? 10 : 5; });

    // Weeks until the goal date, 1 to 12. No date (or one in the past) means a 4-week cycle.
    let weeks = 4, dateNote = null;
    const goalDay = goal && goal.date ? toDay(goal.date) : null;
    if (goalDay != null && goalDay > today) weeks = clamp(Math.ceil((goalDay - today) / (7 * DAY)), 1, 12);
    else if (goal && goal.date) dateNote = "The test date you entered has passed, so this is a 4-week plan.";
    if (dateNote) notes.push(dateNote);

    const drillMin = 22; // ten questions plus reviewing each miss
    const nDrills = Math.max(2, Math.floor((minutes * 0.55) / drillMin));
    const timedMin = 35;
    const reviewMin = Math.max(15, minutes - nDrills * drillMin - timedMin);
    const schedule = [];
    for (let w = 1; w <= weeks; w++) {
      const items = [];
      const last = w === weeks && weeks > 1;
      if (focus.length) {
        for (let i = 0; i < nDrills; i++) {
          // The top focus returns every week; the rest rotate so each skill gets its turn.
          const idx = i === 0 ? 0 : (((w - 1) * (nDrills - 1) + (i - 1)) % Math.max(1, focus.length - 1)) + 1;
          const f = focus[Math.min(idx, focus.length - 1)];
          items.push({ type: "drill", key: f.key, skill: f.skill, domain: f.domain, count: f.drill, minutes: drillMin });
        }
      }
      if (last && minutes >= 240) items.push({ type: "fulltest", text: "Full-length practice test, then review every miss", minutes: Math.min(minutes, 150) });
      else items.push({ type: "timed", text: "One timed module from Practice tests (about 32 minutes for Reading & Writing, 35 for Math)", minutes: timedMin });
      items.push({ type: "review", text: "Review misses: write the rule you missed in one line, then redo the question", minutes: reviewMin });
      schedule.push({
        week: w, minutes,
        theme: w === 1 ? "Find the gaps" : last ? "Check progress" : "Build and repeat",
        items,
      });
    }

    const summary = {
      test, goal, baseline: base, gap, weeks, minutesPerWeek: minutes,
      domainsFromReport: domReport ? Object.keys(domReport.domains).length : 0,
      measuredSkills: scored.filter((s) => s.measured).length, totalSkills: scored.length,
    };
    if (goal && gap != null && gap <= 0) notes.push("You are already at your goal, so this plan keeps your weak spots from slipping.");
    if (!base) notes.push("Add a score report or finish a practice test and the plan will aim at your real gaps. Until then it starts with the skills worth the most points.");
    if (summary.measuredSkills < 3 && summary.domainsFromReport === 0) notes.push("The plan has little to go on yet. Run the first drills and it will sharpen.");

    return { summary, focus, schedule, notes };
  }

  /** Messages for the AI coach. It is handed numbers only: no name, no report text. */
  function coachMessages(plan) {
    const s = plan.summary;
    const lines = [];
    lines.push("Test: " + s.test.toUpperCase());
    if (s.baseline) lines.push("Current " + s.baseline.source + " score: " + s.baseline.value + (s.baseline.date ? " (" + s.baseline.date + ")" : ""));
    if (s.goal) lines.push("Goal: " + s.goal.total + (s.goal.date ? " by " + s.goal.date : "") + (s.gap != null ? " (gap " + s.gap + ")" : ""));
    lines.push("Study time: " + s.minutesPerWeek + " minutes per week for " + s.weeks + " weeks");
    plan.focus.forEach((f, i) => lines.push((i + 1) + ". " + f.skill + " (" + f.sectionLabel + ", " + f.domain + "): " + f.signals.join("; ")));
    return [
      { role: "system", content:
        "You are a calm, encouraging SAT/ACT study coach writing to a high-school student. Use ONLY the facts in the data. " +
        "Do not invent scores, percentiles or promises, and never guarantee a result. Write 110 to 160 words in plain text (no markdown): " +
        "one sentence on where they are, then the top three focus areas each with the reason in a short sentence, then one concrete thing to do this week. " +
        "Where a focus area says it is not measured yet, say a first drill will show how it really stands. Do not mention being an AI." },
      { role: "user", content: lines.join("\n") },
    ];
  }

  return { buildPlan, coachMessages, SAT_SHARE, SECTION_LABEL, accWeak, bandWeak };
});
