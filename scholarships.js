/* Scholarship Searcher: browse a bundled catalog of real scholarship programs.
   Filters and saves stay on-device (profile.scholarships) and sync like the
   college list. Amounts and deadlines change every cycle: always verify on the
   provider's official page. This is a discovery tool, not an application service. */
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
  const DEFAULTS = { v: 1, query: "", grade: "all", tags: [], savedOnly: false, sort: "featured", saved: [] };

  function sp() {
    if (!profile.scholarships || typeof profile.scholarships !== "object" || Array.isArray(profile.scholarships)) profile.scholarships = {};
    Object.keys(DEFAULTS).forEach((k) => { if (profile.scholarships[k] === undefined) profile.scholarships[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); });
    if (!Array.isArray(profile.scholarships.saved)) profile.scholarships.saved = [];
    if (!Array.isArray(profile.scholarships.tags)) profile.scholarships.tags = [];
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
  function filtered() {
    const c = sp();
    let out = LIST.filter((s) => matchesQuery(s, c.query.trim()));
    if (c.grade !== "all") out = out.filter((s) => s.grades.includes(c.grade));
    if (c.tags.length) out = out.filter((s) => c.tags.every((t) => s.tags.includes(t)));
    if (c.savedOnly) out = out.filter((s) => c.saved.includes(s.id));
    if (c.sort === "amount") out = out.slice().sort((a, b) => b.hi - a.hi || a.n.localeCompare(b.n));
    else if (c.sort === "name") out = out.slice().sort((a, b) => a.n.localeCompare(b.n));
    else out = out.slice().sort((a, b) => ORDER.get(a.id) - ORDER.get(b.id));
    return out;
  }

  function tagChipsHtml(s) {
    return s.tags.map((t) => '<span class="scholar-tag">' + esc(TAG_LABEL.get(t) || t) + "</span>").join("");
  }
  function cardHtml(s) {
    const c = sp();
    const saved = c.saved.includes(s.id);
    const site = s.link.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return '<article class="scholar-card" data-id="' + esc(s.id) + '">' +
      '<div class="scholar-head"><div><h3 class="scholar-name">' + esc(s.n) + '</h3><p class="scholar-org">' + esc(s.org) + "</p></div>" +
      '<button type="button" class="secondary scholar-save" data-scholar-save="' + esc(s.id) + '" aria-pressed="' + saved + '" title="' + (saved ? "Remove from your list" : "Save to your list") + '">' + (saved ? "★ Saved" : "☆ Save") + "</button></div>" +
      '<p class="scholar-meta"><strong>' + esc(s.amtNote) + "</strong><span>" + esc(s.deadline) + "</span></p>" +
      '<div class="scholar-tags">' + tagChipsHtml(s) + "</div>" +
      '<p class="scholar-elig">' + esc(s.elig) + "</p>" +
      '<details class="scholar-details"><summary>About this award</summary><p>' + esc(s.desc) + '</p>' +
      '<p class="small muted">Offer: ' + esc(s.org) + " · Typical cycle: " + esc(s.deadline) + "</p>" +
      '<a class="scholar-link" href="' + esc(s.link) + '" target="_blank" rel="noopener">Official page · ' + esc(site) + " ↗</a></details></article>";
  }
  function resultsHtml() {
    const c = sp();
    const rows = filtered();
    if (!rows.length) {
      return '<div class="scholar-empty"><h3>No scholarships match those filters</h3><p class="small muted">Try a shorter search, clear a filter, or switch grade level.</p><button type="button" class="secondary" id="scholarResetEmpty">Reset filters</button></div>';
    }
    return rows.map(cardHtml).join("");
  }
  function chipsHtml() {
    const c = sp();
    const chips = TAGS.map(([key, label]) =>
      '<button type="button" class="secondary scholar-chip' + (c.tags.includes(key) ? " on" : "") + '" data-scholar-tag="' + key + '" aria-pressed="' + c.tags.includes(key) + '">' + esc(label) + "</button>").join("");
    return '<button type="button" class="secondary scholar-chip' + (c.savedOnly ? " on" : "") + '" data-scholar-saved aria-pressed="' + c.savedOnly + '">★ My list (' + c.saved.length + ")</button>" + chips +
      '<button type="button" class="secondary scholar-chip" data-scholar-reset>Reset</button>';
  }

  function renderScholarshipScreen() {
    const host = $id("screen-scholarships");
    if (!host) return;
    const c = sp();
    host.innerHTML =
      '<header class="st-head college-head"><div class="st-kicker">Scholarship searcher · real programs, official links</div>' +
      '<h1>Find scholarships that fit you</h1>' +
      '<p class="small muted">Search ' + LIST.length + ' national, identity, STEM, arts, military, and state aid programs in one place. Awards and deadlines change every cycle, so confirm details on each provider\'s official page before applying. ' + esc(syncNote()) + '</p>' +
      '<div class="college-top-actions"><button type="button" class="secondary" id="scholarshipBack">← Back</button><span class="small muted">Catalog updated ' + esc(SD.meta.updated || "") + " · " + esc(SD.meta.note || "") + "</span></div></header>" +
      '<div class="scholar-toolbar">' +
      '<label class="scholar-search" for="scholarQuery">Search scholarships<input type="search" id="scholarQuery" value="' + esc(c.query) + '" placeholder="e.g., STEM, first-generation, writing, Texas" autocomplete="off"></label>' +
      '<label class="scholar-select" for="scholarGrade">Grade level<select id="scholarGrade"><option value="all"' + (c.grade === "all" ? " selected" : "") + ">All grades</option>" +
      ["9", "10", "11", "12"].map((g) => '<option value="' + g + '"' + (c.grade === g ? " selected" : "") + ">Grade " + g + "</option>").join("") + "</select></label>" +
      '<label class="scholar-select" for="scholarSort">Sort by<select id="scholarSort"><option value="featured"' + (c.sort === "featured" ? " selected" : "") + ">Featured</option><option value=\"amount\"" + (c.sort === "amount" ? " selected" : "") + ">Largest award</option><option value=\"name\"" + (c.sort === "name" ? " selected" : "") + ">A-Z</option></select></label>" +
      "</div>" +
      '<div class="scholar-chips" role="group" aria-label="Scholarship filters" id="scholarChips">' + chipsHtml() + "</div>" +
      '<p class="small muted scholar-count" id="scholarCount" role="status"></p>' +
      '<div class="scholar-list" id="scholarResults">' + resultsHtml() + "</div>" +
      '<p class="small muted college-foot">Scholarship catalog is an original app list of real programs; it is not affiliated with any provider. Amounts and deadlines are typical values that change every cycle. Need-based programs usually also require the FAFSA. <a href="https://studentaid.gov/" target="_blank" rel="noopener">FAFSA</a> · <a href="https://bigfuture.collegeboard.org/pay-for-college" target="_blank" rel="noopener">College Board paying for college</a>.</p>';
    updateCount();
  }
  function updateCount() {
    const el = $id("scholarCount");
    if (!el) return;
    const c = sp();
    const rows = filtered();
    const savedPart = c.saved.length ? " · " + c.saved.length + " saved" : "";
    el.textContent = rows.length + " scholarship" + (rows.length === 1 ? "" : "s") + (c.savedOnly ? " in your list" : " match your search") + savedPart + ".";
  }
  function updateResults() {
    const box = $id("scholarResults");
    if (box) box.innerHTML = resultsHtml();
    const chips = $id("scholarChips");
    if (chips) chips.innerHTML = chipsHtml();
    updateCount();
  }

  // ---- State changes ----
  function toggleSaved(id) {
    const c = sp();
    const i = c.saved.indexOf(id);
    if (i >= 0) c.saved.splice(i, 1); else c.saved.push(id);
    saveScholarships();
    updateResults();
  }
  function toggleTag(tag) {
    const c = sp();
    const i = c.tags.indexOf(tag);
    if (i >= 0) c.tags.splice(i, 1); else c.tags.push(tag);
    saveScholarships();
    updateResults();
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

  document.addEventListener("input", (e) => { if (e.target && e.target.id === "scholarQuery") { sp().query = e.target.value; saveScholarships(); updateResults(); } });
  document.addEventListener("change", (e) => {
    if (!e.target) return;
    if (e.target.id === "scholarGrade") { sp().grade = e.target.value; saveScholarships(); updateResults(); }
    if (e.target.id === "scholarSort") { sp().sort = e.target.value; saveScholarships(); updateResults(); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target || !e.target.closest) return;
    const open = e.target.closest("[data-scholarship-open]");
    if (open) { e.preventDefault(); openScholarships(); return; }
    if (!e.target.closest("#screen-scholarships")) return;
    if (e.target.closest("#scholarshipBack")) { e.preventDefault(); closeScholarships(); return; }
    const save = e.target.closest("[data-scholar-save]");
    if (save) { e.preventDefault(); toggleSaved(save.dataset.scholarSave); return; }
    const tag = e.target.closest("[data-scholar-tag]");
    if (tag) { e.preventDefault(); toggleTag(tag.dataset.scholarTag); return; }
    if (e.target.closest("[data-scholar-saved]")) { e.preventDefault(); sp().savedOnly = !sp().savedOnly; saveScholarships(); updateResults(); return; }
    if (e.target.closest("[data-scholar-reset]") || e.target.closest("#scholarResetEmpty")) { e.preventDefault(); const c = sp(); c.query = ""; c.grade = "all"; c.tags = []; c.savedOnly = false; c.sort = "featured"; saveScholarships(); renderScholarshipScreen(); return; }
  });
  const topBtn = $id("btnScholarships");
  if (topBtn) topBtn.addEventListener("click", () => openScholarships());
  const startBtn = $id("btnScholarshipStart");
  if (startBtn) startBtn.addEventListener("click", () => openScholarships());

  window.scholarshipFeature = { open: openScholarships, count: LIST.length, meta: SD.meta, filtered };
})();
