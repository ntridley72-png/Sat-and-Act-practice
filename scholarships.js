/* Scholarship Searcher: browse a bundled catalog of real scholarship programs.
   Filters and saves stay on-device (profile.scholarships) and sync like the
   college list. Amounts and deadlines change every cycle: always verify on the
   provider's official page. This is a discovery tool, not an application service.
   Layout follows the Oct 2026 mockup: filter rail (272px) / result list / detail
   pane (300-420px), one flex row that degrades into a filters sheet (<1024px)
   and a pushed full-screen detail pane (<768px). */
(function () {
  "use strict";
  const $id = (x) => document.getElementById(x);
  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s));
  const SD = window.SCHOLARSHIP_DATA || { scholarships: [], meta: {} };
  const LIST = SD.scholarships || [];
  const ORDER = new Map(LIST.map((s, i) => [s.id, i]));

  const TAGS = [
    ["merit", "Merit"],
    ["need", "Financial need"],
    ["firstgen", "First-generation"],
    ["identity", "Identity-based"],
    ["stem", "STEM"],
    ["arts", "Arts & media"],
    ["writing", "Writing & essay"],
    ["service", "Service & leadership"],
    ["military", "Military families"],
    ["women", "Women"],
    ["lgbtq", "LGBTQ+"],
    ["undocumented", "Undocumented / DACA"],
    ["foster", "Foster youth"],
    ["cte", "Career & technical"],
    ["state", "State aid"],
    ["noessay", "No essay"],
    ["athletics", "Athletics"],
  ];
  const TAG_LABEL = new Map(TAGS);
  // The mockup groups filters by the question each one answers.
  const FIELD_KEYS = [["stem", "STEM"], ["arts", "Arts"], ["military", "Military & service"], ["identity", "Identity-based"], ["state", "State aid"]];
  const DEFAULTS = { v: 2, query: "", grade: "all", tags: [], savedOnly: false, sort: "deadline", saved: [], amountMin: 1000, effort: [], selected: null };

  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  function deadlineMonth(s) {
    const t = String(s.deadline || "").toLowerCase();
    for (let i = 0; i < 12; i++) if (t.indexOf(MONTHS[i]) >= 0) return i;
    return null;
  }
  function monthsUntil(s) {
    const m = deadlineMonth(s);
    if (m == null) return null;
    const now = new Date();
    let d = m - now.getMonth();
    if (d < 0) d += 12;
    return d;
  }
  function isRenewable(s) { return /renewab/i.test(String(s.amtNote || "") + " " + String(s.desc || "")); }
  function isOpen(s) { const d = monthsUntil(s); return d == null ? true : d <= 6; }
  function amountLabel(s) {
    if (s.hi >= 90000) return "Full cost";
    if (s.lo && s.hi && s.lo !== s.hi) return "$" + s.lo.toLocaleString() + "–$" + s.hi.toLocaleString();
    return "$" + (s.hi || s.lo || 0).toLocaleString();
  }
  function amountNumber(s) { return s.hi >= 90000 ? 40000 : s.hi || s.lo || 0; }

  function sp() {
    if (!profile.scholarships || typeof profile.scholarships !== "object" || Array.isArray(profile.scholarships)) profile.scholarships = {};
    Object.keys(DEFAULTS).forEach((k) => { if (profile.scholarships[k] === undefined) profile.scholarships[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); });
    if (!Array.isArray(profile.scholarships.saved)) profile.scholarships.saved = [];
    if (!Array.isArray(profile.scholarships.tags)) profile.scholarships.tags = [];
    if (!Array.isArray(profile.scholarships.effort)) profile.scholarships.effort = [];
    return profile.scholarships;
  }
  function saveScholarships() { try { saveProfile(); } catch (e) {} }
  function syncNote() {
    return cloud.user ? "Saved scholarships sync to your account on every device." : "Saved on this device. Sign in to sync your scholarship list across devices.";
  }

  // ---- Filtering and sorting ----
  function matchesQuery(s, q) {
    if (!q) return true;
    const hay = (s.n + " " + s.org + " " + s.desc + " " + s.elig + " " + s.tags.map((t) => TAG_LABEL.get(t) || t).join(" ")).toLowerCase();
    return q.toLowerCase().split(/\s+/).every((part) => hay.includes(part));
  }
  function baseRows(c, opts) {
    opts = opts || {};
    let out = LIST.filter((s) => matchesQuery(s, c.query.trim()));
    if (c.grade !== "all") out = out.filter((s) => s.grades.includes(c.grade));
    if (opts.skipTags !== true && c.tags.length) out = out.filter((s) => c.tags.every((t) => s.tags.includes(t)));
    if (c.savedOnly) out = out.filter((s) => c.saved.includes(s.id));
    if (c.amountMin > 1000) out = out.filter((s) => amountNumber(s) >= c.amountMin);
    if (c.effort.indexOf("noessay") >= 0) out = out.filter((s) => s.tags.indexOf("noessay") >= 0);
    if (c.effort.indexOf("open") >= 0) out = out.filter(isOpen);
    if (c.effort.indexOf("renewable") >= 0) out = out.filter(isRenewable);
    return out;
  }
  function filtered() {
    const c = sp();
    let out = baseRows(c);
    if (c.sort === "amount") out = out.slice().sort((a, b) => amountNumber(b) - amountNumber(a) || a.n.localeCompare(b.n));
    else if (c.sort === "name") out = out.slice().sort((a, b) => a.n.localeCompare(b.n));
    else out = out.slice().sort((a, b) => { const da = monthsUntil(a), dbb = monthsUntil(b); return (da == null ? 12 : da) - (dbb == null ? 12 : dbb) || ORDER.get(a.id) - ORDER.get(b.id); });
    return out;
  }
  function countFor(key) {
    const c = sp();
    return baseRows(c, { skipTags: true }).filter((s) => s.tags.indexOf(key) >= 0).length;
  }

  function statusChipsHtml(s) {
    const chips = [];
    const d = monthsUntil(s);
    if (d != null && d <= 6) chips.push('<span class="schl-chip open">Closes in ' + (d === 0 ? "under a month" : d + " month" + (d === 1 ? "" : "s")) + "</span>");
    if (s.tags.indexOf("noessay") >= 0) chips.push('<span class="schl-chip">No essay</span>');
    else if (s.tags.indexOf("writing") >= 0) chips.push('<span class="schl-chip">Essay</span>');
    if (isRenewable(s)) chips.push('<span class="schl-chip">Renewable</span>');
    return chips.join("");
  }
  function cardHtml(s) {
    const c = sp();
    const sel = c.selected === s.id;
    return '<article class="schl-card' + (sel ? " sel" : "") + '" role="button" tabindex="0" data-schl-open="' + esc(s.id) + '" aria-label="' + esc(s.n) + ", " + esc(amountLabel(s)) + '">' +
      '<div class="schl-card-top"><h3 class="schl-name">' + esc(s.n) + '</h3><span class="schl-amt">' + esc(amountLabel(s)) + "</span></div>" +
      '<p class="schl-sponsor">' + esc(s.org) + "</p>" +
      '<div class="schl-chips">' + statusChipsHtml(s) + "</div></article>";
  }
  function resultsHtml() {
    const rows = filtered();
    if (!rows.length) return '<div class="schl-empty"><h3>No scholarships match those filters</h3><p class="small muted">Try a shorter search, clear a filter, or switch grade level.</p><button type="button" class="secondary" id="scholarResetEmpty">Reset filters</button></div>';
    return rows.map(cardHtml).join("");
  }

  function filtersHtml() {
    const c = sp();
    const gradeChip = (g) => '<button type="button" class="schl-gchip' + (c.grade === g ? " on" : "") + '" data-schl-grade="' + g + '" aria-pressed="' + (c.grade === g) + '">' + g + "</button>";
    const field = ([key, label]) => '<label class="schl-check"><input type="checkbox" data-schl-tag="' + key + '"' + (c.tags.indexOf(key) >= 0 ? " checked" : "") + "><span>" + esc(label) + '</span><b class="schl-count">' + countFor(key) + "</b></label>";
    const effort = ([key, label]) => '<label class="schl-check"><input type="checkbox" data-schl-effort="' + key + '"' + (c.effort.indexOf(key) >= 0 ? " checked" : "") + "><span>" + esc(label) + "</span></label>";
    const active = c.tags.length + c.effort.length + (c.savedOnly ? 1 : 0) + (c.grade !== "all" ? 1 : 0) + (c.amountMin > 1000 ? 1 : 0);
    return '<div class="schl-filters-head"><h2>Filters</h2><div class="schl-filters-head-actions">' + (active ? '<button type="button" class="schl-clear" id="scholarReset">Clear</button>' : "") + '<button type="button" class="schl-close" id="schlCloseFilters" aria-label="Close filters">\u2715</button></div></div>' +
      '<fieldset class="schl-fs"><legend>Grade</legend><div class="schl-grades">' + ["12", "11", "10", "9"].map(gradeChip).join("") + "</div></fieldset>" +
      '<fieldset class="schl-fs"><legend>Award size</legend><input type="range" id="schlAmount" min="1000" max="40000" step="1000" value="' + c.amountMin + '" aria-label="Minimum award size"><div class="schl-range-labels"><span>$1,000</span><span id="schlAmountOut">' + (c.amountMin > 1000 ? "$" + c.amountMin.toLocaleString() + "+" : "Any amount") + "</span><span>$40,000</span></div></fieldset>" +
      '<fieldset class="schl-fs"><legend>Field</legend><div class="schl-checks">' + FIELD_KEYS.map(field).join("") + "</div></fieldset>" +
      '<fieldset class="schl-fs"><legend>Effort</legend><div class="schl-checks">' + [["noessay", "No essay"], ["open", "Deadline still open"], ["renewable", "Renewable"]].map(effort).join("") + "</div></fieldset>";
  }

  function detailHtml() {
    const c = sp();
    const s = LIST.find((x) => x.id === c.selected);
    if (!s) return '<div class="schl-detail-empty"><h2>Pick a program</h2><p class="small muted">Select a scholarship to see eligibility, steps, and the official link. Nothing you open leaves this page.</p></div>';
    const saved = c.saved.includes(s.id);
    const elig = String(s.elig || "").split(/[.;]\s+/).filter(Boolean);
    const steps = [];
    steps.push("Confirm you meet every eligibility line below.");
    if (s.tags.indexOf("writing") >= 0) steps.push("Draft the required essay and have someone read it aloud before you submit.");
    else if (s.tags.indexOf("noessay") >= 0) steps.push("No essay needed — have your basic details and school information ready.");
    else steps.push("Gather your application details: school, GPA, activities, and any documents the provider lists.");
    if (s.tags.indexOf("need") >= 0) steps.push("File the FAFSA first — need-based programs usually ask for it.");
    steps.push("Apply on the official page before the deadline and keep a confirmation copy.");
    return '<div class="schl-detail-head"><h2>' + esc(s.n) + "</h2><p class=\"small muted\">" + esc(s.org) + "</p></div>" +
      '<div class="schl-tiles"><div class="schl-tile"><span class="t-lbl">Award</span><span class="t-val">' + esc(amountLabel(s)) + '</span></div><div class="schl-tile"><span class="t-lbl">Deadline</span><span class="t-val">' + esc(s.deadline) + "</span></div></div>" +
      '<section class="schl-sec"><h3>Who can apply</h3><ul>' + elig.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ul></section>" +
      '<section class="schl-sec"><h3>What it takes</h3><ol>' + steps.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ol></section>" +
      '<p class="small muted">' + esc(s.desc) + "</p>" +
      '<div class="schl-detail-actions"><a class="schl-official" href="' + esc(s.link) + '" target="_blank" rel="noopener">Official page ↗</a>' +
      '<button type="button" class="schl-star" data-scholar-save="' + esc(s.id) + '" aria-pressed="' + saved + '" aria-label="' + (saved ? "Remove from your list" : "Save to your list") + '">' + (saved ? "★" : "☆") + "</button></div>";
  }

  let filtersOpen = false;
  let detailOpen = false;
  function chromeHtml() {
    const c = sp();
    const active = c.tags.length + c.effort.length + (c.savedOnly ? 1 : 0) + (c.grade !== "all" ? 1 : 0) + (c.amountMin > 1000 ? 1 : 0);
    const rows = filtered();
    return '<header class="schl-head"><h1>Scholarship lookup</h1>' +
      '<label class="schl-search" for="scholarQuery"><span class="visually-hidden">Search scholarships</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="scholarQuery" value="' + esc(c.query) + '" placeholder="e.g., STEM, first-generation, writing, Texas" autocomplete="off"></label>' +
      '<button type="button" class="schl-mylist' + (c.savedOnly ? " on" : "") + '" id="schlMyList" aria-pressed="' + c.savedOnly + '">★ My list (' + c.saved.length + ")</button></header>" +
      '<div class="schl-body">' +
      '<button type="button" class="schl-filterbtn" id="schlFilterBtn" aria-expanded="' + filtersOpen + '">Filters' + (active ? " (" + active + ")" : "") + "</button>" +
      '<aside class="schl-filters' + (filtersOpen ? " open" : "") + '" id="schlFilters" aria-label="Scholarship filters">' + filtersHtml() + "</aside>" +
      '<div class="schl-rail-backdrop' + (filtersOpen ? " show" : "") + '" id="schlRailBack"></div>' +
      '<section class="schl-list" aria-label="Results">' +
      '<div class="schl-list-head"><span id="scholarCount" role="status">' + rows.length + " of " + LIST.length + " programs</span>" +
      '<label class="schl-sort">Sort<select id="scholarSort"><option value="deadline"' + (c.sort === "deadline" ? " selected" : "") + ">deadline soonest</option><option value=\"amount\"" + (c.sort === "amount" ? " selected" : "") + ">largest award</option><option value=\"name\"" + (c.sort === "name" ? " selected" : "") + ">A-Z</option><option value=\"featured\"" + (c.sort === "featured" ? " selected" : "") + ">featured</option></select></label></div>" +
      '<div class="schl-results" id="scholarResults">' + resultsHtml() + "</div></section>" +
      '<aside class="schl-detail' + (detailOpen ? " open" : "") + '" id="schlDetail" aria-label="Program details">' +
      '<button type="button" class="schl-detail-back" id="schlDetailBack">← Back to results</button>' + detailHtml() + "</aside>" +
      "</div>" +
      '<p class="small muted schl-foot">Amounts and deadlines change each cycle — confirm current requirements on the provider\'s page before applying. Catalog updated ' + esc(SD.meta.updated || "") + " · " + esc(syncNote()) + ' <a href="https://studentaid.gov/" target="_blank" rel="noopener">FAFSA</a></p>';
  }

  function renderScholarshipScreen() {
    const host = $id("scholarshipBody") || $id("screen-scholarships");
    if (!host) return;
    host.innerHTML = chromeHtml();
    if (window.FunSatAds) window.FunSatAds.mount();
  }
  function updateResults() {
    const box = $id("scholarResults");
    if (box) box.innerHTML = resultsHtml();
    const filters = $id("schlFilters");
    if (filters) filters.innerHTML = filtersHtml();
    const detail = $id("schlDetail");
    if (detail) { detail.innerHTML = '<button type="button" class="schl-detail-back" id="schlDetailBack">← Back to results</button>' + detailHtml(); }
    const btn = $id("schlFilterBtn");
    if (btn) {
      const c = sp();
      const active = c.tags.length + c.effort.length + (c.savedOnly ? 1 : 0) + (c.grade !== "all" ? 1 : 0) + (c.amountMin > 1000 ? 1 : 0);
      btn.textContent = "Filters" + (active ? " (" + active + ")" : "");
    }
    const my = $id("schlMyList");
    if (my) { const c = sp(); my.textContent = "★ My list (" + c.saved.length + ")"; my.setAttribute("aria-pressed", c.savedOnly); my.classList.toggle("on", c.savedOnly); }
    const cnt = $id("scholarCount");
    if (cnt) cnt.textContent = filtered().length + " of " + LIST.length + " programs";
  }

  // ---- State changes ----
  function toggleSaved(id) {
    const c = sp();
    const i = c.saved.indexOf(id);
    if (i >= 0) c.saved.splice(i, 1); else c.saved.push(id);
    saveScholarships();
    updateResults();
  }
  function selectProgram(id) {
    sp().selected = id;
    saveScholarships();
    detailOpen = true;
    updateResults();
    const detail = $id("schlDetail");
    if (detail) detail.classList.add("open");
  }

  // ---- Open / close and app integration ----
  let scholarshipReturnView = "start";
  function openScholarships() {
    if (state.view === "scholarships") { renderScholarshipScreen(); return; }
    scholarshipReturnView = state.view === "results" ? "results" : state.view === "test" || state.view === "routing" ? state.view : "start";
    state.view = "scholarships";
    render();
    try { scrollTo(0, 0); } catch (e) {}
    try { requestAnimationFrame(() => $id("scholarQuery")?.focus()); } catch (e) {}
  }
  function closeScholarships() {
    state.view = scholarshipReturnView === "test" || scholarshipReturnView === "routing" ? scholarshipReturnView : scholarshipReturnView === "results" ? "results" : "start";
    render();
  }
  const baseRender = render;
  render = function () {
    if (state.view === "scholarships") { showScreen("screen-scholarships"); renderScholarshipScreen(); return; }
    baseRender();
  };

  document.addEventListener("input", (e) => {
    if (!e.target) return;
    if (e.target.id === "scholarQuery") { sp().query = e.target.value; saveScholarships(); updateResults(); }
    if (e.target.id === "schlAmount") {
      const v = Number(e.target.value);
      sp().amountMin = v;
      const out = $id("schlAmountOut");
      if (out) out.textContent = v > 1000 ? "$" + v.toLocaleString() + "+" : "Any amount";
      saveScholarships();
      updateResults();
    }
  });
  document.addEventListener("change", (e) => {
    if (!e.target) return;
    if (e.target.id === "scholarSort") { sp().sort = e.target.value; saveScholarships(); updateResults(); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target || !e.target.closest) return;
    const open = e.target.closest("[data-scholarship-open]");
    if (open && !e.target.closest("#screen-scholarships")) { e.preventDefault(); openScholarships(); return; }
    if (!e.target.closest("#screen-scholarships")) return;
    if (e.target.closest("#scholarshipBack")) { e.preventDefault(); closeScholarships(); return; }
    if (e.target.closest("#schlFilterBtn")) { e.preventDefault(); filtersOpen = !filtersOpen; const rail = $id("schlFilters"); const back = $id("schlRailBack"); const btn = $id("schlFilterBtn"); rail.classList.toggle("open", filtersOpen); back.classList.toggle("show", filtersOpen); btn.setAttribute("aria-expanded", String(filtersOpen)); return; }
    if (e.target.closest("#schlRailBack") || e.target.closest("#schlCloseFilters")) { e.preventDefault(); filtersOpen = false; $id("schlFilters").classList.remove("open"); $id("schlRailBack").classList.remove("show"); $id("schlFilterBtn").setAttribute("aria-expanded", "false"); return; }
    if (e.target.closest("#schlDetailBack")) { e.preventDefault(); detailOpen = false; $id("schlDetail").classList.remove("open"); return; }
    const card = e.target.closest("[data-schl-open]");
    if (card) { e.preventDefault(); selectProgram(card.dataset.schlOpen); return; }
    const save = e.target.closest("[data-scholar-save]");
    if (save) { e.preventDefault(); toggleSaved(save.dataset.scholarSave); return; }
    if (e.target.closest("#schlMyList")) { e.preventDefault(); sp().savedOnly = !sp().savedOnly; saveScholarships(); updateResults(); return; }
    const gc = e.target.closest("[data-schl-grade]");
    if (gc) { e.preventDefault(); const g = gc.dataset.schlGrade; const c = sp(); c.grade = c.grade === g ? "all" : g; saveScholarships(); updateResults(); return; }
    if (e.target.closest("#scholarReset") || e.target.closest("#scholarResetEmpty")) { e.preventDefault(); const c = sp(); c.query = ""; c.grade = "all"; c.tags = []; c.effort = []; c.savedOnly = false; c.amountMin = 1000; saveScholarships(); renderScholarshipScreen(); return; }
  });
  document.addEventListener("change", (e) => {
    if (!e.target) return;
    const tag = e.target.closest("[data-schl-tag]");
    if (tag) { const c = sp(); const k = tag.dataset.schlTag; const i = c.tags.indexOf(k); if (i >= 0) c.tags.splice(i, 1); else c.tags.push(k); saveScholarships(); updateResults(); return; }
    const ef = e.target.closest("[data-schl-effort]");
    if (ef) { const c = sp(); const k = ef.dataset.schlEffort; const i = c.effort.indexOf(k); if (i >= 0) c.effort.splice(i, 1); else c.effort.push(k); saveScholarships(); updateResults(); return; }
  });
  document.addEventListener("keydown", (e) => {
    const card = e.target && e.target.closest && e.target.closest("[data-schl-open]");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectProgram(card.dataset.schlOpen); }
  });
  const topBtn = $id("btnScholarships");
  if (topBtn) topBtn.addEventListener("click", () => openScholarships());
  const startBtn = $id("btnScholarshipStart");
  if (startBtn) startBtn.addEventListener("click", () => openScholarships());

  window.scholarshipFeature = { open: openScholarships, count: LIST.length, meta: SD.meta, filtered };
})();
