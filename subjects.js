/* Subject practice: skill-level drills (SAT + ACT), separate from test scoring.
   Results are stored in profile.skillStats and never affect the SAT/ACT estimate. */
(function () {
  "use strict";
  const $id = (x) => document.getElementById(x);
  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s));

  // ---- Skill inference for older questions that were never tagged ----
  function inferSkill(q) {
    const t = String(q.q || "").toLowerCase();
    const d = q.domain || "";
    const isMath = ["Algebra", "Advanced Math", "Problem-Solving & Data Analysis", "Geometry & Trigonometry"].includes(d);
    if (isMath) {
      if (d === "Algebra") {
        if (/system|two equations|pair of equations/.test(t)) return "Systems of two linear equations";
        if (/inequal|at least|at most|no more than|no less than|≥|≤/.test(t)) return "Linear inequalities";
        if (/slope|intercept|line|graph/.test(t)) return "Linear equations in two variables";
        if (/function|f\(x\)|model/.test(t)) return "Linear functions";
        return "Linear equations in one variable";
      }
      if (d === "Advanced Math") {
        if (/quadratic|parabola|factor|roots|vertex/.test(t)) return "Quadratic equations";
        if (/exponent|growth|decay|double|half-life/.test(t)) return "Exponential functions";
        if (/sqrt|radical/.test(t)) return "Radical equations";
        if (/equivalent|expand|simplify|expression/.test(t)) return "Equivalent expressions";
        return "Nonlinear functions";
      }
      if (d === "Problem-Solving & Data Analysis") {
        if (/percent|%/.test(t)) return "Percentages";
        if (/ratio|proportion/.test(t)) return "Ratios and proportional relationships";
        if (/mean|median|average/.test(t)) return "Measures of center";
        if (/probability|random|chance/.test(t)) return "Probability";
        if (/per hour|per minute|rate|speed/.test(t)) return "Unit rates";
        if (/scatter/.test(t)) return "Scatterplots";
        if (/sample|survey|margin of error|population/.test(t)) return "Statistical inference";
        return "Measures of spread";
      }
      if (/circle|radius|diameter|circumference/.test(t)) return "Circles";
      if (/sin|cos|tan|trig/.test(t)) return "Right triangle trigonometry";
      if (/similar/.test(t)) return "Similar triangles";
      if (/right triangle|hypotenuse|pythag/.test(t)) return "Right triangles";
      if (/angle|degrees/.test(t)) return "Angles";
      return "Area and volume";
    }
    if (d === "Information & Ideas") {
      if (/as used in the text|most nearly means/.test(t)) return "Words in Context";
      if (/text 1/.test(t)) return "Cross-Text Connections";
      if (/purpose|structure|function of/.test(t)) return "Text Structure and Purpose";
      if (/main idea|central idea|best states/.test(t)) return "Central Ideas and Details";
      if (/support|evidence|detail/.test(t)) return "Command of Evidence";
      if (/infer|suggest|imply/.test(t)) return "Inferences";
      if (/graph|table|percent|data/.test(t)) return "Quantitative Evidence";
      return "Central Ideas and Details";
    }
    if (d === "Craft & Structure") {
      if (/as used in the text|most nearly means/.test(t)) return "Words in Context";
      if (/text 1/.test(t)) return "Cross-Text Connections";
      if (/purpose|structure|function of/.test(t)) return "Text Structure and Purpose";
      return "Words in Context";
    }
    if (d === "Expression of Ideas") {
      if (/notes|student wants/.test(t)) return "Rhetorical Synthesis";
      if (/transition|however|therefore|for example|likewise/.test(t)) return "Transitions";
      return "Rhetorical Synthesis";
    }
    if (d === "Standard English Conventions") {
      if (/comma|semicolon|colon|dash|punctuat/.test(t)) return "Boundaries";
      if (/modif|opening phrase/.test(t)) return "Modifiers";
      if (/subject|verb|agreement/.test(t)) return "Subject-Verb Agreement";
      if (/possess|apostrophe/.test(t)) return "Possessives";
      if (/pronoun|its|their|they/.test(t)) return "Pronouns";
      if (/tense|has |had |have /.test(t)) return "Verb tense";
      return "Punctuation";
    }
    return d || "General";
  }
  const skillOf = (q) => q.skill || inferSkill(q);

  // ---- Inventory: sections and skills available for each test ----
  const SECTION_LABEL = { rw: "Reading & Writing", math: "Math", english: "English", reading: "Reading", science: "Science" };
  function bankFor(test, section) {
    if (section === "science") return (typeof ACT_SCIENCE !== "undefined" ? ACT_SCIENCE : []);
    if (section === "math") return BANK.math;
    if (section === "rw") return BANK.rw;
    if (section === "english") return BANK.rw.filter((q) => q.kind === "writing");
    if (section === "reading") return BANK.rw.filter((q) => q.kind === "reading");
    return [];
  }
  function buildInventory() {
    const inv = {};
    [["sat", "rw"], ["sat", "math"], ["act", "english"], ["act", "math"], ["act", "reading"], ["act", "science"]].forEach(([test, section]) => {
      bankFor(test, section).filter((q) => !q.withheld).forEach((q) => {
        const skill = skillOf(q);
        const key = [test, section, q.domain || "General", skill].join("|");
        (inv[key] = inv[key] || { key, test, section, domain: q.domain || "General", skill, ids: [] }).ids.push(q.id);
      });
    });
    return inv;
  }
  let INVENTORY = {};
  const refreshInventory = () => { INVENTORY = buildInventory(); };

  function statsFor(key) { const s = (profile.skillStats || {})[key]; if (!s || !(s.r + s.w)) return null; return { accuracy: Math.round((s.r / (s.r + s.w)) * 100), sessions: s.sessions || 0, r: s.r, w: s.w }; }

  // ---- Picker UI ----
  const pick = { test: "sat", section: "rw", selected: null, length: 10, sort: "weak" };
  function sectionsFor(test) { return test === "act" ? ["english", "math", "reading", "science"] : ["rw", "math"]; }
  function itemsFor() {
    const list = Object.values(INVENTORY).filter((x) => x.test === pick.test && x.section === pick.section);
    const byDomain = {};
    list.forEach((x) => (byDomain[x.domain] = byDomain[x.domain] || []).push(x));
    return byDomain;
  }
  function weakSkills() {
    const all = Object.values(INVENTORY).filter((x) => x.test === pick.test);
    return all.map((x) => ({ x, st: statsFor(x.key) })).filter((e) => e.st && e.st.r + e.st.w >= 4).sort((a, b) => a.st.accuracy - b.st.accuracy).slice(0, 4);
  }
  const SORTS = [["weak", "Weakest first"], ["az", "A\u2013Z"], ["pool", "Most questions"]];
  function sortedItems() {
    const list = Object.values(INVENTORY).filter((x) => x.test === pick.test && x.section === pick.section);
    const acc = (x) => { const st = statsFor(x.key); return st ? st.accuracy : null; };
    if (pick.sort === "az") return list.sort((a, b) => a.skill.localeCompare(b.skill));
    if (pick.sort === "pool") return list.sort((a, b) => b.ids.length - a.ids.length || a.skill.localeCompare(b.skill));
    // Weakest first, and skills with no attempts yet sort last: a dash is not a
    // weakness, it is an unknown, and putting unknowns on top buries the
    // skills the student has actually struggled with.
    return list.sort((a, b) => {
      const sa = acc(a), sb = acc(b);
      if (sa == null && sb == null) return a.skill.localeCompare(b.skill);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa - sb || a.skill.localeCompare(b.skill);
    });
  }
  function accCell(st) {
    if (!st) return '<span class="sk-none">Not practised yet</span>';
    const tone = st.accuracy < 50 ? " low" : st.accuracy < 75 ? " mid" : " ok";
    return '<span class="sk-acc"><span class="sk-meter' + tone + '"><i style="width:' + st.accuracy + '%"></i></span>' +
      '<b>' + st.accuracy + '%</b><span class="sk-of">' + st.r + "/" + (st.r + st.w) + "</span></span>";
  }
  function renderSubjectsScreen() {
    const host = $id("subjectsBody") || $id("screen-subjects");
    if (!host) return;
    refreshInventory();
    const items = sortedItems();
    const practised = items.filter((x) => statsFor(x.key)).length;
    const tab = (on, attr, value, label) => '<button type="button" role="tab" aria-selected="' + on + '" class="subject-tab' +
      (on ? " active" : "") + '" data-s-' + attr + '="' + esc(value) + '">' + esc(label) + "</button>";
    const SECTION_LABEL = { rw: "Reading & Writing", math: "Math", english: "English", reading: "Reading", science: "Science" };

    host.innerHTML =
      '<header class="subjects-head"><div class="st-kicker">Subject practice \u00b7 separate from test scoring</div>' +
      '<h1>Drill one skill at a time</h1>' +
      '<p class="small muted">Every skill in this section against what you have scored on it. Drill results are saved as skill stats and never change your predicted score.</p></header>' +

      '<div class="sk-controls">' +
      '<div class="subject-tabs" role="tablist" aria-label="Test">' +
      ["sat", "act"].map((x) => tab(pick.test === x, "test", x, x.toUpperCase())).join("") + "</div>" +
      '<div class="subject-tabs" role="tablist" aria-label="Section">' +
      sectionsFor(pick.test).map((x) => tab(pick.section === x, "section", x, SECTION_LABEL[x] || x)).join("") + "</div>" +
      '<label class="sk-sort">Sort<select id="subjectSort">' +
      SORTS.map(([v, t]) => '<option value="' + v + '"' + (pick.sort === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" +
      '<label class="sk-sort">Per drill<select id="subjectLen">' +
      [5, 10, 15, 20].map((n) => '<option value="' + n + '"' + (pick.length === n ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>" +
      "</div>" +

      (items.length
        ? '<p class="sk-summary small muted">' + items.length + " skill" + (items.length === 1 ? "" : "s") +
          " \u00b7 " + practised + " practised" + (practised < items.length ? " \u00b7 a skill shows no accuracy until you have drilled it" : "") + "</p>" +
          '<div class="sk-tablewrap"><table class="sk-table"><thead><tr>' +
          '<th scope="col">Skill</th><th scope="col">Domain</th><th scope="col">Your accuracy</th>' +
          '<th scope="col" class="sk-num">Pool</th><th scope="col"><span class="visually-hidden">Start</span></th>' +
          "</tr></thead><tbody>" +
          items.map((x) => {
            const st = statsFor(x.key);
            const n = Math.min(pick.length, x.ids.length);
            return '<tr data-s-key="' + esc(x.key) + '">' +
              '<th scope="row" class="sk-name">' + esc(x.skill) + "</th>" +
              '<td class="sk-dom">' + esc(x.domain) + "</td>" +
              '<td class="sk-acccell">' + accCell(st) + "</td>" +
              '<td class="sk-num">' + x.ids.length + "</td>" +
              '<td class="sk-go"><button type="button" class="sk-drill" data-s-go="' + esc(x.key) + '" ' +
              'aria-label="Drill ' + esc(x.skill) + ", " + n + ' questions">Drill ' + n + "</button></td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<p class="small muted">No questions available for this section yet.</p>') +

      '<p class="sk-foot small muted">Drill results are saved separately from your practice tests.</p>';
    wireSubjects();
    if (window.FunSatAds) window.FunSatAds.mount();
  }
  function wireSubjects() {
    const host = $id("screen-subjects");
    if (!host) return;
    host.querySelectorAll("[data-s-test]").forEach((b) => b.addEventListener("click", () => { pick.test = b.dataset.sTest; pick.section = sectionsFor(pick.test)[0]; pick.selected = null; renderSubjectsScreen(); }));
    host.querySelectorAll("[data-s-section]").forEach((b) => b.addEventListener("click", () => { pick.section = b.dataset.sSection; pick.selected = null; renderSubjectsScreen(); }));
    const lenSel = $id("subjectLen");
    if (lenSel) lenSel.addEventListener("change", () => { pick.length = Number(lenSel.value) || 10; renderSubjectsScreen(); });
    const sortSel = $id("subjectSort");
    if (sortSel) sortSel.addEventListener("change", () => { pick.sort = sortSel.value; renderSubjectsScreen(); });
    host.querySelectorAll("[data-s-go]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      startSubjectDrill(b.dataset.sGo, pick.length);
    }));
    // The Drill button on each row is the action; the row itself is not clickable,
    // so a stray tap on a long skill name cannot start a drill.
  }
  function openSubjects() {
    state.view = "subjects";
    render();
    try { scrollTo(0, 0); } catch (e) {}
  }

  // ---- Drill start ----
  function leastSeen(pool, exclude, n) {
    return pool.filter((id) => exclude.indexOf(id) === -1)
      .sort((a, b) => ((profile.seen && profile.seen[a]) || 0) - ((profile.seen && profile.seen[b]) || 0) || a.localeCompare(b))
      .slice(0, n);
  }
  function fill(pool, target, exclude) {
    const need = target - exclude.length;
    if (need <= 0) return [];
    let out = sample(pool.filter((id) => exclude.indexOf(id) === -1), need);
    if (out.length < need) out = out.concat(leastSeen(pool, exclude.concat(out), need - out.length));
    return out;
  }
  function startSubjectDrill(key, length) {
    const item = INVENTORY[key];
    if (!item) return;
    const pool = item.ids.filter((id) => byId(id));
    if (!pool.length) return;
    let ids = fill(pool, Math.min(length, pool.length), []);
    let mixed = false;
    if (ids.length < length) {
      const extra = Object.values(INVENTORY).filter((x) => x !== item && x.test === item.test && x.section === item.section && x.domain === item.domain).flatMap((x) => x.ids).filter((id) => byId(id));
      if (extra.length) { const add = fill(extra, length, ids); if (add.length) { ids = ids.concat(add); mixed = true; } }
    }
    if (ids.length < length) {
      const sectionPool = Object.values(INVENTORY).filter((x) => x.test === item.test && x.section === item.section).flatMap((x) => x.ids).filter((id) => byId(id));
      const add = fill(sectionPool, length, ids);
      if (add.length) { ids = ids.concat(add); mixed = true; }
    }
    if (Object.keys(state.answers).length && !state.done) finalizeAttempt(false);
    const tt = item.test, section = item.section;
    const d = defByKey(tt, section);
    const cfg = Object.assign({}, state.cfg, tt === "act" ? { testType: "act", actSection: section } : { testType: "sat", section: section, satModule: "full" }, { total: ids.length });
    clearSaved();
    state = newState(cfg, {});
    state.keys = [section]; state.counts = {}; state.counts[section] = ids.length; state.routes = {};
    state.plan = {}; state.plan[section] = { adaptive: d.adaptive, bank: d.bank, moduleOnly: "drill", drillDomain: item.skill, mods: [ids] };
    sessionStreak = 0; sessionBestStreak = 0; sessionTokensEarned = 0; sessionUnlocks = []; pendingUnlock = null;
    state.drillMeta = { key, skill: item.skill, domain: item.domain, test: item.test, section: item.section, length: ids.length, mixed };
    state.view = "test"; save(); render(); scrollTo(0, 0);
  }

  // ---- Record separate skill stats (never touches score estimates) ----
  function recordSkillStats() {
    const meta = state.drillMeta;
    if (!meta) return;
    const rec = (profile.history || []).find((h) => h.id === state.attemptId);
    if (!rec || rec.subjectCounted) return;
    rec.subjectCounted = true; rec.subjectKey = meta.key; rec.subjectLabel = meta.skill;
    if (!profile.skillStats || typeof profile.skillStats !== "object") profile.skillStats = {};
    const st = profile.skillStats[meta.key] || (profile.skillStats[meta.key] = { r: 0, w: 0, sessions: 0 });
    st.r += rec.totalCorrect || 0;
    st.w += Math.max(0, (rec.totalAnswered || 0) - (rec.totalCorrect || 0));
    st.sessions++; st.lastAt = Date.now();
    try { saveProfile(); saveHistory(); } catch (e) {}
  }
  const baseFinalize = finalizeAttempt;
  finalizeAttempt = function () { baseFinalize.apply(this, arguments); try { recordSkillStats(); } catch (e) {} };

  const baseTopicResults = renderTopicResults;
  renderTopicResults = function () {
    baseTopicResults.apply(this, arguments);
    const meta = state.drillMeta;
    const host = $id("resultsDomains");
    if (!meta || !host) return;
    const rec = (profile.history || []).find((h) => h.id === state.attemptId);
    const acc = rec && rec.totalAnswered ? Math.round((rec.totalCorrect / rec.totalAnswered) * 100) : 0;
    const st = statsFor(meta.key);
    host.insertAdjacentHTML("afterbegin",
      '<div class="notice info subject-result"><strong>Subject drill: ' + esc(meta.skill) + "</strong> — " + acc + "% this set." +
      (meta.mixed ? ' Some questions came from related skills in ' + esc(meta.domain) + "." : "") +
      (st ? " Overall on this skill: " + st.accuracy + "% across " + st.sessions + " drill" + (st.sessions === 1 ? "" : "s") + "." : "") +
      '<div style="margin-top:8px"><button type="button" class="secondary" id="subjectAgain">Practice another subject</button></div></div>');
    const again = $id("subjectAgain");
    if (again) again.addEventListener("click", openSubjects);
  };

  // ---- Screen routing + nav ----
  const baseRender = render;
  render = function () {
    if (state.view === "subjects") { showScreen("screen-subjects"); renderSubjectsScreen(); return; }
    baseRender();
  };
  function init() {
    const btn = $id("btnSubjectPractice");
    if (btn) btn.addEventListener("click", openSubjects);
    window.FunSATSubjects = { open: openSubjects, inventory: () => (refreshInventory(), INVENTORY), start: startSubjectDrill };
  }
  init();
})();
