/* College matcher interface (/college-match/). Questions one at a time in three depths (Quick, Detailed, Advanced) that
 * share one set of answers; results from the deterministic engine (college-match-engine.js); a college list builder;
 * and a research panel that asks the server to answer from the college's official website.
 *
 * Privacy: answers stay in this browser (localStorage "funsatMatcher_v1", cleared by "Clear my answers"). Scores and
 * GPA are read from the FunSAT profile on this device if present. Saving a college writes to that same profile.
 * The research panel sends only the college id and the question, never grades, scores or budget.
 */
(function () {
  "use strict";
  const root = document.getElementById("cmx");
  if (!root) return;
  const KEY = "funsatMatcher_v1", PROFILE = "satPrepProfile_v1";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; };
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const pct = (x) => Math.round(x * 100);

  // ---------------------------------------------------------------- data loading (after first paint)
  let M = null, CD = null, MD = null, loadErr = false;
  const ready = new Promise((resolve) => {
    const need = ["/college-data.js", "/college-match-data.js"];
    let left = need.length;
    const done = () => { if (--left === 0) { M = window.FunSATMatch; CD = window.COLLEGE_DATA; MD = window.COLLEGE_MATCH_DATA; resolve(); } };
    need.forEach((src) => {
      if ((src.includes("match-data") && window.COLLEGE_MATCH_DATA) || (src.includes("college-data") && window.COLLEGE_DATA)) return done();
      const s = document.createElement("script"); s.src = src; s.async = true; s.onload = done; s.onerror = () => { loadErr = true; render(); };
      document.head.appendChild(s);
    });
  });

  // ---------------------------------------------------------------- state
  const saved = readJson(KEY) || {};
  const S = Object.assign({ mode: "quick", step: 0, A: {}, imp: {}, weights: {}, view: "questions", section: "overall", text: "", proposals: null, compare: [], scenario: null }, saved);
  S.A = S.A || {}; S.imp = S.imp || {}; S.weights = S.weights || {};
  const persist = () => writeJson(KEY, { mode: S.mode, step: S.step, A: S.A, imp: S.imp, weights: S.weights, view: S.view, section: S.section, text: S.text, compare: S.compare });
  function profile() { return readJson(PROFILE) || {}; }
  // Pre-fill scores and GPA the student already has in FunSAT (never overwrite an answer they gave here).
  (function prefill() {
    const c = profile().college || {};
    if (S.A.sat == null && Number.isFinite(c.sat)) S.A.sat = c.sat;
    if (S.A.act == null && Number.isFinite(c.act)) S.A.act = c.act;
    if (S.A.gpa == null && Number.isFinite(c.gpa)) { S.A.gpa = c.gpa; S.A.gpaScale = c.gpaScale || "4uw"; }
    if (!S.A.homeState && c.homeState) S.A.homeState = c.homeState;
    try {
      const q = new URLSearchParams(location.search);
      if (num(q.get("sat"))) S.A.sat = num(q.get("sat"));
      if (num(q.get("act"))) S.A.act = num(q.get("act"));
      if (num(q.get("gpa"))) { S.A.gpa = num(q.get("gpa")); S.A.gpaScale = "4uw"; }
      if (q.toString()) history.replaceState(null, "", location.pathname);
    } catch (e) {}
  })();

  // ---------------------------------------------------------------- questions
  const IMP_KEYS = ["must", "very", "important", "nice", "none"];
  const REGION_LABEL = { northeast: "Northeast", midwest: "Midwest", south: "South", west: "West" };
  const healthy = () => (S.A.majors || []).some((k) => ["pharmsci", "biology", "chemistry", "nursing", "health", "biochem", "neuro", "kines", "publichealth"].includes(k));
  const has = (k) => S.A[k] != null && S.A[k] !== "" && !(Array.isArray(S.A[k]) && !S.A[k].length);
  // type: multi | single | number | text | places | weights. crit: engine criterion ids whose importance this question sets.
  const Q = [
    { id: "majors", modes: "qda", type: "majors", title: "What might you study?", help: "Pick up to four. Choose \"Undecided\" if you have no idea yet: we will favor colleges with many options.", crit: ["major"] },
    { id: "professional", modes: "da", when: healthy, type: "single", title: "Do you want a professional school on the same campus?", help: "Useful if you plan on pharmacy, medicine or physical therapy: you can meet faculty and sometimes apply early. You can still apply to these schools from any college.",
      options: [["", "Doesn't matter"], ["pharmd", "Pharmacy school (PharmD)"], ["md", "Medical school (MD)"], ["do", "Osteopathic medical school (DO)"], ["dpt", "Physical therapy (DPT)"]], crit: ["prof"] },
    { id: "test", modes: "qda", type: "test", title: "Your grades and test scores", help: "Used only to place each college as Likely, Target or Reach, never in your personal fit. Leave blank if you do not know yet." },
    { id: "regions", modes: "qda", type: "regions", title: "Where would you like to go to college?", help: "Choose regions, states, or both. Leave empty for anywhere in the U.S.", crit: ["region"] },
    { id: "home", modes: "qda", type: "home", title: "Where is home?", help: "A city name is enough; it is used only to measure distance and never leaves your browser.", crit: ["awayFromHome", "instate"] },
    { id: "budget", modes: "qda", type: "budget", title: "What can your family pay each year?", help: "Net price is what families pay after grants and scholarships. Pick your household income so we use the net price families like yours paid.", crit: ["budget"] },
    { id: "settings", modes: "qda", type: "multi", title: "What setting do you picture?", options: [["city", "City"], ["suburb", "Suburb"], ["town", "Town"], ["rural", "Rural"]], crit: ["setting"] },
    { id: "sizes", modes: "qda", type: "multi", title: "How big a college?", options: [["small", "Small (under 5,000 undergraduates)"], ["medium", "Medium (5,000-15,000)"], ["large", "Large (over 15,000)"]], crit: ["size"] },
    { id: "control", modes: "qda", type: "single", title: "Public or private?", options: [["any", "Either"], ["public", "Public"], ["private", "Private"]], crit: ["control"] },
    { id: "after", modes: "qda", type: "multi", title: "What matters for after college?", options: [["earnings", "Graduates earn well"], ["jobs", "Help finding jobs while in school"], ["hospital", "A hospital or medical school on campus"], ["grad", "Most students graduate"]], crit: ["earnings", "jobs", "hospital", "gradrate"] },
    { id: "priorities", modes: "qda", type: "priorities", title: "What matters most?", help: "Pick up to three. You can fine-tune every weight on the results page." },
    { id: "places", modes: "da", type: "places", title: "Any places you want to stay close to?", help: "For example family in Denver or a partner at college in San Diego. City names only; distances are straight-line miles.", crit: ["places"] },
    { id: "bigcity", modes: "da", type: "single", title: "How close to a big city?", help: "A large city here means a principal city of 250,000+ people.", options: [["", "Doesn't matter"], ["25", "Within 25 miles"], ["60", "Within 60 miles"], ["120", "Within 120 miles"]], crit: ["bigcity"] },
    { id: "classes", modes: "da", type: "single", title: "How small should classes feel?", options: [["", "Doesn't matter"], ["12", "Very small (12 students per faculty member or fewer)"], ["16", "Small (16 or fewer)"], ["20", "Average (20 or fewer)"]], crit: ["sfr"] },
    { id: "campus", modes: "da", type: "multi", title: "Campus life", options: [["housing", "On-campus housing"], ["liveOff", "Free to live off campus as a first-year"], ["athletics", "Big college sports (NCAA, football)"], ["hbcu", "A historically Black college or university"]], crit: ["housing", "liveOff", "athletics", "hbcu"] },
    { id: "religion", modes: "da", type: "single", title: "Religious affiliation", options: [["any", "No preference"], ["prefer", "I'd like a religiously affiliated college"], ["avoid", "I'd prefer no religious affiliation"]], crit: ["religion"] },
    { id: "flex", modes: "da", type: "multi", title: "Academic flexibility", options: [["ap", "Gives credit for AP exams"], ["abroad", "Study abroad"], ["online", "Some courses online"], ["research", "Undergraduate research programs"]], crit: ["ap", "abroad", "online", "research"] },
    { id: "car", modes: "da", type: "single", title: "Will you have a car at college?", options: [["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]], crit: ["carfree"] },
    { id: "military", modes: "da", type: "single", title: "Will you use military education benefits or join ROTC?", options: [["no", "No"], ["benefits", "Military benefits (GI Bill)"], ["rotc", "ROTC"], ["both", "Both"]] },
    { id: "yellow", modes: "da", when: () => ["benefits", "both"].includes(S.A.military), type: "single", title: "How important is the Yellow Ribbon Program?", help: "Yellow Ribbon helps cover private or out-of-state costs above the GI Bill cap. Seats are limited.", options: [["important", "Important"], ["must", "Must have"], ["nice", "Nice to have"]], crit: ["veterans"], impFromAnswer: true },
    { id: "debt", modes: "a", type: "single", title: "Typical debt you could live with", options: [["", "Doesn't matter"], ["15000", "Under $15,000"], ["20000", "Under $20,000"], ["25000", "Under $25,000"]], crit: ["debt"] },
    { id: "support", modes: "a", type: "multi", title: "Support that matters to you", options: [["counseling", "Academic and career counseling"], ["childcare", "On-campus child care for student parents"]], crit: ["counseling", "childcare"] },
    { id: "gradmin", modes: "a", type: "single", title: "Lowest six-year graduation rate you'd accept", options: [["", "Doesn't matter"], ["60", "60%"], ["70", "70%"], ["80", "80%"]], crit: ["gradrate"] },
    { id: "earnmin", modes: "a", type: "single", title: "Median earnings ten years after starting", options: [["", "Doesn't matter"], ["45000", "$45,000+"], ["55000", "$55,000+"], ["70000", "$70,000+"]], crit: ["earnings"] },
  ];
  const visible = () => Q.filter((q) => q.modes.includes(S.mode[0]) && (!q.when || q.when()));

  // ---------------------------------------------------------------- answers -> engine preferences
  function prefs(over) {
    const A = Object.assign({}, S.A, over || {});
    const after = A.after || [], campus = A.campus || [], flex = A.flex || [], support = A.support || [];
    const pr = {
      academics: { majors: (A.majors || []).filter((k) => k !== "undecided"), undecided: (A.majors || []).includes("undecided"), professional: A.professional || null,
        sat: num(A.sat), act: num(A.act), testOptional: !!A.testOptional, research: flex.includes("research"), maxRatio: num(A.classes),
        minGradRate: num(A.gradmin) || (after.includes("grad") ? 65 : null) },
      money: { budget: num(A.budget), incomeBand: A.income === "" || A.income == null ? null : Number(A.income), maxDebt: num(A.debt), inState: !!A.inState, homeState: A.homeState || (A.home && A.home.label ? A.home.label.slice(-2) : null) },
      place: { regions: A.regions || [], states: A.states || [], settings: A.settings || [], sizes: A.sizes || [], places: A.places || [], bigCityMiles: num(A.bigcity),
        home: A.home || null, minFromHome: num(A.minFromHome), maxFromHome: num(A.maxFromHome) },
      career: { minEarnings: num(A.earnmin) || (after.includes("earnings") ? 50000 : null), jobServices: after.includes("jobs"), hospital: after.includes("hospital") },
      campus: { control: A.control && A.control !== "any" ? A.control : null, religion: A.religion && A.religion !== "any" ? A.religion : null, athletics: campus.includes("athletics"),
        housing: campus.includes("housing"), freedomToLiveOff: campus.includes("liveOff"), hbcu: campus.includes("hbcu") },
      flex: { apCredit: flex.includes("ap"), abroad: flex.includes("abroad"), online: flex.includes("online") },
      transport: { noCar: A.car === "no" },
      support: { counseling: support.includes("counseling"), childCare: support.includes("childcare"), yellowRibbon: ["benefits", "both"].includes(A.military), rotc: ["rotc", "both"].includes(A.military) },
      importance: Object.assign({}, S.imp, A.yellow ? { veterans: A.yellow } : {}),
      weights: S.weights,
    };
    return pr;
  }

  // ---------------------------------------------------------------- rendering helpers
  const impSelect = (critIds) => {
    if (!critIds || !critIds.length) return "";
    const cur = S.imp[critIds[0]] || "important";
    const labels = { must: "Must have", very: "Very important", important: "Important", nice: "Nice to have", none: "No preference" };
    return '<label class="cmx-imp">How much does this matter? <select data-imp="' + critIds.join(",") + '">' +
      IMP_KEYS.map((k) => '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + labels[k] + "</option>").join("") + "</select></label>" +
      '<p class="cmx-small">"Must have" removes colleges that verifiably fail it. If our data cannot check it, the college is listed under "Needs checking" instead.</p>';
  };
  const chk = (name, val, on, label) => '<label class="cmx-opt"><input type="checkbox" data-multi="' + name + '" value="' + esc(val) + '"' + (on ? " checked" : "") + "><span>" + esc(label) + "</span></label>";
  const radio = (name, val, on, label) => '<label class="cmx-opt"><input type="radio" name="r-' + name + '" data-single="' + name + '" value="' + esc(val) + '"' + (on ? " checked" : "") + "><span>" + esc(label) + "</span></label>";

  function questionBody(q) {
    const A = S.A;
    if (q.type === "multi") return '<div class="cmx-opts">' + q.options.map(([v, l]) => chk(q.id, v, (A[q.id] || []).includes(v), l)).join("") + "</div>";
    if (q.type === "single") return '<div class="cmx-opts">' + q.options.map(([v, l]) => radio(q.id, v, (A[q.id] == null ? "" : String(A[q.id])) === v, l)).join("") + "</div>";
    if (q.type === "majors") {
      const list = Object.entries(MD.meta.majors).sort((a, b) => a[1].label.localeCompare(b[1].label));
      const chosen = A.majors || [];
      return '<input type="search" class="cmx-filter" data-filter-majors placeholder="Filter majors: nursing, engineering, art..." aria-label="Filter majors">' +
        '<div class="cmx-opts cmx-majors">' + chk("majors", "undecided", chosen.includes("undecided"), "Undecided / exploring") +
        list.map(([k, v]) => chk("majors", k, chosen.includes(k), v.label)).join("") + "</div>";
    }
    if (q.type === "test") {
      return '<div class="cmx-grid"><label>Unweighted GPA (4.0 scale)<input data-field="gpa" inputmode="decimal" value="' + esc(A.gpa ?? "") + '" placeholder="3.4"></label>' +
        '<label>SAT total<input data-field="sat" inputmode="numeric" value="' + esc(A.sat ?? "") + '" placeholder="1200"></label>' +
        '<label>ACT composite<input data-field="act" inputmode="numeric" value="' + esc(A.act ?? "") + '" placeholder="25"></label></div>' +
        '<label class="cmx-opt"><input type="checkbox" data-flag="testOptional"' + (A.testOptional ? " checked" : "") + "><span>I plan to apply test-optional</span></label>" +
        '<p class="cmx-small">No score yet? <a href="/sat-practice-test/">Take a free practice test</a> or <a href="/calculators/high-school-gpa/">calculate your GPA</a>. Colleges do not report GPA ranges to the federal government, so GPA is shown but not used to place colleges.</p>';
    }
    if (q.type === "regions") {
      const states = [...new Set(CD.colleges.map((c) => c.st))].sort();
      return '<div class="cmx-opts">' + Object.entries(REGION_LABEL).map(([k, l]) => chk("regions", k, (A.regions || []).includes(k), l)).join("") + "</div>" +
        '<details class="cmx-more"' + ((A.states || []).length ? " open" : "") + '><summary>Pick specific states</summary><div class="cmx-opts cmx-states">' +
        states.map((s) => chk("states", s, (A.states || []).includes(s), s)).join("") + "</div></details>";
    }
    if (q.type === "home") {
      return '<label class="cmx-wide">Home city<input data-place="home" list="cmxPlaces" value="' + esc(A.home ? A.home.label : "") + '" placeholder="Start typing: Austin, TX"></label>' +
        '<div class="cmx-grid"><label>At least this far from home (miles)<input data-field="minFromHome" inputmode="numeric" value="' + esc(A.minFromHome ?? "") + '"></label>' +
        '<label>At most this far (miles)<input data-field="maxFromHome" inputmode="numeric" value="' + esc(A.maxFromHome ?? "") + '"></label></div>' +
        '<label class="cmx-opt"><input type="checkbox" data-flag="inState"' + (A.inState ? " checked" : "") + "><span>I want in-state public tuition</span></label>";
    }
    if (q.type === "budget") {
      return '<div class="cmx-grid"><label>Most per year after aid ($)<input data-field="budget" inputmode="numeric" value="' + esc(A.budget ?? "") + '" placeholder="25000"></label>' +
        '<label>Household income<select data-field="income"><option value="">Prefer not to say</option>' +
        M.BANDS.map((b, i) => '<option value="' + i + '"' + (String(A.income) === String(i) ? " selected" : "") + ">" + b + "</option>").join("") + "</select></label></div>" +
        '<p class="cmx-small">The matcher never subtracts aid you might get. Every college page links its official net price calculator, which gives a personal estimate.</p>';
    }
    if (q.type === "priorities") {
      const cats = Object.entries(M.CATEGORIES);
      return '<div class="cmx-opts">' + cats.map(([k, v]) => chk("priorities", k, (A.priorities || []).includes(k), v.label)).join("") + "</div>";
    }
    if (q.type === "places") {
      const pl = A.places || [];
      return pl.map((p, i) => '<div class="cmx-place"><b>' + esc(p.label) + '</b><label>within <input data-placemiles="' + i + '" inputmode="numeric" value="' + p.miles + '"> miles</label>' +
        '<select data-placeimp="' + i + '" aria-label="How important">' + ["very", "important", "nice"].map((k) => '<option value="' + k + '"' + (p.importance === k ? " selected" : "") + ">" + { very: "Very important", important: "Important", nice: "Nice to have" }[k] + "</option>").join("") + "</select>" +
        '<button type="button" class="cmx-x" data-delplace="' + i + '" aria-label="Remove ' + esc(p.label) + '">×</button></div>').join("") +
        '<label class="cmx-wide">Add a city<input data-place="add" list="cmxPlaces" placeholder="Denver, CO"></label>';
    }
    return "";
  }

  function questionsView() {
    const vis = visible();
    if (S.step >= vis.length) S.step = vis.length - 1;
    const q = vis[S.step];
    const modes = [["quick", "Quick", "about 11 questions"], ["detailed", "Detailed", "about 20"], ["advanced", "Advanced", "about 25"]];
    return '<div class="cmx-modes" role="group" aria-label="Questionnaire depth">' + modes.map(([k, l, n]) => '<button type="button" data-mode="' + k + '" aria-pressed="' + (S.mode === k) + '">' + l + ' <small>' + n + "</small></button>").join("") + "</div>" +
      '<details class="cmx-describe"' + (S.text ? " open" : "") + '><summary>Or describe your ideal college in your own words</summary>' +
      '<textarea data-text rows="4" maxlength="2000" placeholder="I want to study biology near a city, work part-time, stay within a few hours of my family in Denver, and keep costs under $20,000 a year.">' + esc(S.text) + "</textarea>" +
      '<button type="button" class="cmx-btn" data-act="interpret">Read my description</button>' + proposalsHtml() + "</details>" +
      '<div class="cmx-progress"><span>Question ' + (S.step + 1) + " of " + vis.length + "</span><i style=\"width:" + Math.round(((S.step + 1) / vis.length) * 100) + '%"></i></div>' +
      '<section class="cmx-q" aria-labelledby="cmxQ"><h2 id="cmxQ">' + esc(q.title) + "</h2>" + (q.help ? '<p class="cmx-help">' + esc(q.help) + "</p>" : "") +
      questionBody(q) + (q.crit && !q.impFromAnswer ? impSelect(q.crit) : "") + "</section>" +
      '<div class="cmx-nav"><button type="button" class="cmx-btn" data-act="back"' + (S.step ? "" : " disabled") + ">Back</button>" +
      '<button type="button" class="cmx-btn" data-act="skip">Skip / not sure</button>' +
      (S.step < vis.length - 1 ? '<button type="button" class="cmx-btn primary" data-act="next">Next</button>' : "") +
      '<button type="button" class="cmx-btn' + (S.step === vis.length - 1 ? " primary" : "") + '" data-act="results">See my matches</button></div>' +
      '<datalist id="cmxPlaces"></datalist>';
  }

  function proposalsHtml() {
    if (!S.proposals) return "";
    const p = S.proposals;
    return '<div class="cmx-proposals"><p><b>Here is how we read it.</b> Tick what is right; nothing changes until you apply it.</p>' +
      (p.proposals.length ? p.proposals.map((x, i) => chk("proposal", String(i), x.on !== false, x.label + (x.text ? ' (from "' + x.text + '")' : ""))).join("") : "<p>We did not find preferences we can match on.</p>") +
      (p.questions || []).map((qq, i) => '<label class="cmx-wide">' + esc(qq.text) + '<select data-pq="' + i + '"><option value="">Choose</option>' + qq.options.map((o) => "<option>" + esc(o) + "</option>").join("") + "</select></label>").join("") +
      (p.unsupported.length ? '<p class="cmx-small">We can\'t match on these yet because we have no verified data for them: ' + esc(p.unsupported.join(", ")) + ". Ask about them in the research panel for a specific college.</p>" : "") +
      '<button type="button" class="cmx-btn primary" data-act="apply-text">Apply the ticked preferences</button></div>';
  }

  function applyProposal(x) {
    const A = S.A;
    const addTo = (k, vals) => { A[k] = [...new Set([...(A[k] || []), ...vals])]; };
    if (x.key === "majors") addTo("majors", x.value.slice(0, 4));
    else if (x.key === "professional") A.professional = x.value;
    else if (x.key === "undecided") addTo("majors", ["undecided"]);
    else if (x.key === "settings") addTo("settings", x.value);
    else if (x.key === "sizes") addTo("sizes", x.value);
    else if (x.key === "budget") A.budget = x.value;
    else if (x.key === "noCar") A.car = "no";
    else if (x.key === "research") addTo("flex", ["research"]);
    else if (x.key === "abroad") addTo("flex", ["abroad"]);
    else if (x.key === "jobServices") addTo("after", ["jobs"]);
    else if (x.key === "hospital") addTo("after", ["hospital"]);
    else if (x.key === "yellowRibbon") A.military = A.military === "rotc" ? "both" : "benefits";
    else if (x.key === "rotc") A.military = A.military === "benefits" ? "both" : "rotc";
    else if (x.key === "hbcu") addTo("campus", ["hbcu"]);
    else if (x.key === "religion") A.religion = x.value;
    else if (x.key === "control") A.control = x.value;
    else if (x.key === "place") { A.places = (A.places || []).filter((p) => p.label !== x.value.label).concat([x.value]); }
  }

  // ---------------------------------------------------------------- results
  let ranked = null, rankedKey = "";
  function compute() {
    const pr = prefs(S.scenario || {});
    const key = JSON.stringify(pr);
    if (key !== rankedKey) { ranked = M.rank(CD.colleges, MD, pr, { concordance: CD.concordance.actToSat, limit: 30 }); rankedKey = key; }
    return ranked;
  }
  const slugOf = (() => { let map = null; return (c) => {
    if (!map) {
      const slug = (t) => String(t).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().replace(/-{2,}/g, "-");
      const counts = {}; CD.colleges.forEach((x) => { const b = slug(x.n); counts[b] = (counts[b] || 0) + 1; });
      map = new Map(); const seen = new Set();
      CD.colleges.forEach((x) => { let s = counts[slug(x.n)] === 1 ? slug(x.n) : slug(x.n) + "-" + String(x.st || "").toLowerCase(); while (seen.has(s)) s += "-" + x.id; seen.add(s); map.set(x.id, s); });
    }
    return "/colleges/" + map.get(c) + "/";
  }; })();

  function fitText(r) {
    if (r.fit == null) return "—";
    return r.coverage < 0.6 ? pct(r.fitLow) + "–" + pct(r.fitHigh) : String(pct(r.fit));
  }
  const ADM_CLASS = { Likely: "cmx-likely", Target: "cmx-target", Reach: "cmx-reach", Uncertain: "cmx-unk" };
  function card(r, opts) {
    opts = opts || {};
    const c = CD.colleges.find((x) => x.id === r.id), m = MD.colleges[String(r.id)] || {};
    const img = c && Array.isArray(c.imgs) && c.imgs[0];
    const savedIds = (profile().college || {}).saved || [];
    return '<li class="cmx-card" data-id="' + r.id + '">' +
      (img ? '<img class="cmx-img" src="' + esc(img.u) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' : "") +
      '<div class="cmx-card-main"><h3><a href="' + slugOf(r.id) + '">' + esc(r.name) + '</a></h3><p class="cmx-small">' + esc(r.city) + ", " + esc(r.st) + (c ? " · " + (c.ctrl === "public" ? "Public" : "Private") + " · " + Number(c.enr).toLocaleString("en-US") + " undergraduates" : "") + "</p>" +
      '<dl class="cmx-measures"><div><dt>Personal fit</dt><dd>' + fitText(r) + '<small>/100</small></dd></div>' +
      '<div><dt>Admissions</dt><dd class="cmx-word ' + ADM_CLASS[r.admissions.label] + '">' + r.admissions.label + "</dd></div>" +
      '<div><dt>Cost</dt><dd class="cmx-word">' + esc(r.affordability.label) + (r.affordability.value ? "<small>" + money(r.affordability.value) + "/yr</small>" : "") + "</dd></div>" +
      "<div><dt>Evidence</dt><dd>" + pct(r.coverage) + "%<small>checked</small></dd></div></dl>" +
      (r.strengths.length ? '<p class="cmx-why"><b>Why it fits:</b> ' + r.strengths.slice(0, 3).map(esc).join(" ") + "</p>" : "") +
      (r.concerns.length ? '<p class="cmx-con"><b>Watch out:</b> ' + r.concerns.slice(0, 2).map(esc).join(" ") + "</p>" : "") +
      (r.hardUnknown.length ? '<p class="cmx-con"><b>Needs checking:</b> ' + r.hardUnknown.map((i) => esc(i.label)).join(", ") + "</p>" : "") +
      (opts.excluded ? '<p class="cmx-con"><b>Left out because:</b> ' + r.hardFail.map((i) => esc(i.detail)).join(" ") + "</p>" : "") +
      '<div class="cmx-actions"><button type="button" class="cmx-btn" data-save="' + r.id + '">' + (savedIds.includes(r.id) ? "Saved" : "Save") + "</button>" +
      '<button type="button" class="cmx-btn" data-compare="' + r.id + '" aria-pressed="' + S.compare.includes(r.id) + '">Compare</button>' +
      '<button type="button" class="cmx-btn" data-details="' + r.id + '">Full breakdown</button>' +
      '<button type="button" class="cmx-btn" data-ask="' + r.id + '">Ask about this college</button>' +
      (m.urls && m.urls.netprice ? '<a class="cmx-link" href="' + esc(m.urls.netprice) + '" target="_blank" rel="noopener">Net price calculator</a>' : "") + "</div>" +
      '<div class="cmx-detail" hidden></div></div></li>';
  }

  function details(r) {
    const m = MD.colleges[String(r.id)] || {};
    const st = { met: "Meets", partial: "Partly", unmet: "Doesn't meet", unknown: "Not verified" };
    const rows = r.items.map((i) => '<tr><td>' + esc(i.label) + '</td><td>' + esc(M.IMPORTANCE[i.importance].label) + '</td><td class="cmx-st-' + i.status + '">' + st[i.status] + (i.estimate ? " (estimate)" : "") + "</td><td>" + esc(i.detail) + "</td></tr>").join("");
    const cats = Object.values(r.categories).map((v) => "<tr><td>" + esc(v.label) + '</td><td class="cmx-n">' + Math.round(v.weight) + '%</td><td class="cmx-n">' + (v.score == null ? "—" : pct(v.score)) + '</td><td class="cmx-n">' + pct(v.coverage) + "%</td></tr>").join("");
    const links = m.urls ? Object.entries({ web: "Official website", admissions: "Admissions", aid: "Financial aid", netprice: "Net price calculator", veterans: "Veterans", disability: "Disability services" })
      .filter(([k]) => m.urls[k]).map(([k, l]) => '<a href="' + esc(m.urls[k]) + '" target="_blank" rel="noopener">' + l + "</a>").join(" · ") : "";
    return '<h4>How this college scored for you</h4><div class="cmx-scroll"><table class="cmx-table"><thead><tr><th>Category</th><th>Weight</th><th>Score</th><th>Checked</th></tr></thead><tbody>' + cats + "</tbody></table></div>" +
      '<div class="cmx-scroll"><table class="cmx-table"><thead><tr><th>Your preference</th><th>Importance</th><th>Result</th><th>Evidence</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      "<p><b>Admissions:</b> " + esc(r.admissions.basis) + " " + esc(r.admissions.notes[0]) + "</p>" +
      "<p><b>Cost:</b> " + esc(r.affordability.detail || "") + " Published prices and net prices come from the U.S. Department of Education; your offer can differ.</p>" +
      (r.unknowns.length ? "<p><b>Could not verify:</b> " + r.unknowns.map(esc).join(" ") + "</p>" : "") +
      (links ? '<p class="cmx-small">Official pages (from IPEDS): ' + links + "</p>" : "") +
      '<p class="cmx-small">Sources: College Scorecard (costs, outcomes, scores), IPEDS 2023 (programs, services, location). Scoring version ' + esc(r.version) + ".</p>";
  }

  const SECTIONS = [["overall", "Best overall"], ["affordable", "Within budget"], ["career", "Career"], ["lifestyle", "Location and lifestyle"], ["academic", "Academics"],
    ["reach", "Reach schools worth a look"], ["likely", "Likely schools worth a look"], ["overlooked", "Easy to overlook"], ["verify", "Needs checking"], ["excluded", "Left out"], ["list", "My list"]];

  function weightsPanel(r) {
    const active = new Set(r.all.flatMap((x) => Object.keys(x.categories)));
    if (!active.size) return "";
    const pr = M.normalize(prefs());
    const W = M.categoryWeights(pr, [...active]);
    return '<details class="cmx-weights"><summary>Adjust what matters (weights always add to 100%)</summary><div class="cmx-grid">' +
      [...active].map((k) => '<label>' + esc(M.CATEGORIES[k].label) + ' <b>' + Math.round(W[k]) + '%</b><input type="range" min="0" max="50" step="1" data-weight="' + k + '" value="' + (S.weights[k] ?? M.CATEGORIES[k].weight) + '"></label>').join("") +
      '</div><button type="button" class="cmx-btn" data-act="reset-weights">Default weights</button></details>';
  }

  function listView() {
    const p = profile(), c = p.college || {}, ids = c.saved || [], meta = c.list || {};
    if (!ids.length) return "<p>Save colleges from your results to build a list here.</p>";
    const STAT = ["Interested", "Researching", "Planning to apply", "Applied", "Accepted", "Waitlisted", "Declined"];
    const evals = ids.map((id) => ranked.all.find((x) => x.id === id)).filter(Boolean);
    const warn = [];
    const adm = evals.map((x) => x.admissions.label);
    if (evals.length >= 3 && !adm.includes("Likely")) warn.push("No colleges where you look likely to be admitted. Add one or two Likely schools you would be happy to attend.");
    if (evals.length >= 3 && adm.filter((a) => a === "Reach").length / evals.length > 0.6) warn.push("Most of your list is Reach schools.");
    if (evals.length && prefs().money.budget != null && !evals.some((x) => x.affordability.label === "Within budget")) warn.push("No college on your list is within your budget by net price.");
    const noMajor = evals.filter((x) => x.items.some((i) => i.id === "major" && i.status === "unmet"));
    if (noMajor.length) warn.push("No degrees in your intended major reported at: " + noMajor.map((x) => x.name).join(", ") + ".");
    const lots = evals.filter((x) => x.coverage < 0.5);
    if (lots.length) warn.push("Big unanswered questions at: " + lots.map((x) => x.name).join(", ") + ". Use the research panel.");
    return (warn.length ? '<div class="cmx-warn"><b>List check</b><ul>' + warn.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul><p class=\"cmx-small\">Suggestions only: nothing is removed.</p></div>" : "") +
      '<div class="cmx-scroll"><table class="cmx-table"><thead><tr><th>College</th><th>Fit</th><th>Admissions</th><th>Cost</th><th>Status</th><th>Notes</th></tr></thead><tbody>' +
      evals.map((x) => '<tr><td><a href="' + slugOf(x.id) + '">' + esc(x.name) + '</a></td><td class="cmx-n">' + fitText(x) + "</td><td>" + x.admissions.label + "</td><td>" + esc(x.affordability.label) + "</td>" +
        '<td><select data-liststatus="' + x.id + '">' + STAT.map((s) => "<option" + ((meta[x.id] || {}).status === s ? " selected" : "") + ">" + s + "</option>").join("") + "</select></td>" +
        '<td><input data-listnote="' + x.id + '" value="' + esc((meta[x.id] || {}).note || "") + '" maxlength="300" aria-label="Notes for ' + esc(x.name) + '"></td></tr>').join("") + "</tbody></table></div>" +
      '<p class="cmx-small">Your list is saved in your FunSAT profile on this device and syncs only if you sign in.</p>';
  }

  function compareView() {
    if (S.compare.length < 2) return "";
    const ev = S.compare.map((id) => ranked.all.find((x) => x.id === id)).filter(Boolean);
    const cats = [...new Set(ev.flatMap((x) => Object.keys(x.categories)))];
    return '<section class="cmx-compare"><h2>Side by side, scored on your preferences</h2><div class="cmx-scroll"><table class="cmx-table"><thead><tr><th></th>' + ev.map((x) => "<th>" + esc(x.name) + "</th>").join("") + "</tr></thead><tbody>" +
      "<tr><td>Personal fit</td>" + ev.map((x) => '<td class="cmx-n">' + fitText(x) + "</td>").join("") + "</tr>" +
      cats.map((k) => "<tr><td>" + esc(M.CATEGORIES[k].label) + "</td>" + ev.map((x) => '<td class="cmx-n">' + (x.categories[k] && x.categories[k].score != null ? pct(x.categories[k].score) : "—") + "</td>").join("") + "</tr>").join("") +
      "<tr><td>Admissions</td>" + ev.map((x) => "<td>" + x.admissions.label + "</td>").join("") + "</tr>" +
      "<tr><td>Cost</td>" + ev.map((x) => "<td>" + esc(x.affordability.detail || x.affordability.label) + "</td>").join("") + "</tr>" +
      "<tr><td>Evidence checked</td>" + ev.map((x) => '<td class="cmx-n">' + pct(x.coverage) + "%</td>").join("") + "</tr>" +
      "<tr><td>Trade-offs</td>" + ev.map((x) => "<td>" + (x.concerns.slice(0, 2).map(esc).join(" ") || "None found in our data.") + "</td>").join("") + "</tr></tbody></table></div>" +
      '<p class="cmx-small">No winner is declared: change the weights above and the scores update. </p><button type="button" class="cmx-btn" data-act="clear-compare">Clear comparison</button></section>';
  }

  function resultsView() {
    const r = compute();
    const n = r.sections.overall.length;
    if (!r.all.some((x) => x.fit != null)) return '<p class="cmx-warn">Answer at least one preference question so there is something to match on. <button type="button" class="cmx-btn" data-act="edit">Back to the questions</button></p>';
    const sec = S.section;
    const list = sec === "list" ? null : r.sections[sec] || [];
    const sc = S.scenario;
    return '<div class="cmx-bar"><button type="button" class="cmx-btn" data-act="edit">Edit answers</button>' +
      '<details class="cmx-scenario"' + (sc ? " open" : "") + '><summary>What if my scores were different?</summary><div class="cmx-grid">' +
      '<label>Hypothetical SAT<input data-scn="sat" inputmode="numeric" value="' + esc(sc && sc.sat != null ? sc.sat : "") + '"></label>' +
      '<label>Hypothetical ACT<input data-scn="act" inputmode="numeric" value="' + esc(sc && sc.act != null ? sc.act : "") + '"></label></div>' +
      '<p class="cmx-small">Changes Likely/Target/Reach only; your answers are not changed. ' + (sc ? "<b>Showing a what-if.</b> " : "") + '<a href="/sat-math/">Practice SAT Math</a> · <a href="/sat-reading-writing/">Practice Reading and Writing</a></p>' +
      (sc ? '<button type="button" class="cmx-btn" data-act="clear-scn">Back to my real scores</button>' : "") + "</details></div>" +
      weightsPanel(r) +
      (function () {
        const top = r.sections.overall, tie = top.length >= 10 && top.filter((x) => x.fit === top[0].fit).length >= 10;
        return tie ? '<p class="cmx-warn">Many colleges score the same on your answers, so their order here is not meaningful. Answer a few more questions or adjust the weights to separate them.</p>' : "";
      })() +
      '<p class="cmx-summary" role="status">' + n + " colleges match without breaking a must-have" + (r.sections.excluded.length ? "; " + r.sections.excluded.length + " left out" : "") + (r.sections.verify.length ? "; " + r.sections.verify.length + " need checking" : "") + ".</p>" +
      '<div class="cmx-tabs" role="tablist">' + SECTIONS.map(([k, l]) => '<button type="button" role="tab" data-section="' + k + '" aria-selected="' + (k === sec) + '">' + l + (k !== "list" ? " <small>" + (r.sections[k] || []).length + "</small>" : "") + "</button>").join("") + "</div>" +
      (sec === "list" ? listView() : list.length ? '<ul class="cmx-cards">' + list.slice(0, 30).map((x) => card(x, { excluded: sec === "excluded" })).join("") + "</ul>" : "<p>No colleges in this group for your answers.</p>") +
      compareView() +
      '<section class="cmx-whynot"><h2>Why wasn\'t a college recommended?</h2><label>College name<input data-whynot list="cmxColleges" placeholder="Start typing a college"></label><datalist id="cmxColleges"></datalist><div data-whynot-out aria-live="polite"></div></section>' +
      '<p class="cmx-small">Personal fit uses only your preferences; it never includes admissions. Admissions labels come from reported score ranges and admit rates and are not predictions. Method: <a href="/college-match/how-it-works/">how the matcher works</a>.</p>';
  }

  // ---------------------------------------------------------------- research panel
  function researchHtml(id) {
    const c = CD.colleges.find((x) => x.id === id);
    const sugg = ["Does it have a pre-pharmacy or pre-health advising program?", "How hard is it to change majors?", "Can first-year students live off campus?", "Does it accept AP credit for my exams?", "What scholarships are there for incoming first-years?"];
    return '<div class="cmx-research" role="dialog" aria-label="Ask about ' + esc(c.n) + '"><div class="cmx-research-head"><b>Ask about ' + esc(c.n) + '</b><button type="button" class="cmx-x" data-act="close-research" aria-label="Close">×</button></div>' +
      '<p class="cmx-small">Answers come only from pages on the college\'s official website, with links. If the pages do not answer it, you will be told so. Your grades, scores and budget are not sent.</p>' +
      '<div class="cmx-sugg">' + sugg.map((s) => '<button type="button" class="cmx-chip" data-sugg="' + esc(s) + '">' + esc(s) + "</button>").join("") + "</div>" +
      '<form data-research="' + id + '"><label class="cmx-wide">Your question<textarea name="q" rows="2" maxlength="400" required></textarea></label><button class="cmx-btn primary">Ask</button></form>' +
      '<div class="cmx-answers" aria-live="polite"></div></div>';
  }
  const chat = {};   // per-college conversation for follow-ups, this page only
  async function ask(id, question, out) {
    const hist = chat[id] || (chat[id] = []);
    const box = document.createElement("div"); box.className = "cmx-answer";
    box.innerHTML = "<p><b>You:</b> " + esc(question) + '</p><p class="cmx-small">Reading the college\'s official pages…</p>';
    out.appendChild(box);
    try {
      const r = await fetch("/api/college-research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, question, history: hist.slice(-4) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.answer) throw new Error(j.error || "The research service is not available right now.");
      hist.push({ q: question, a: j.answer });
      const src = (j.sources || []).filter((s) => /^https:\/\/[^\s"<>]+$/.test(String(s.url || ""))).map((s, i) => '<li id="src-' + id + "-" + i + '"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || s.url) + "</a> <small>read " + esc(s.retrieved || "") + "</small>" + (s.quote ? "<blockquote>" + esc(s.quote) + "</blockquote>" : "") + "</li>").join("");
      box.innerHTML = "<p><b>You:</b> " + esc(question) + "</p>" + '<div class="cmx-ans-body">' + esc(j.answer).replace(/\n/g, "<br>") + "</div>" +
        (j.verified === false ? '<p class="cmx-warn">Parts of this answer could not be matched to a source. Treat it as unverified.</p>' : "") +
        (src ? '<ol class="cmx-sources">' + src + "</ol>" : '<p class="cmx-small">No official page answered this.</p>') +
        (j.limits ? '<p class="cmx-small">' + esc(j.limits) + "</p>" : "") +
        '<button type="button" class="cmx-link" data-report="' + id + '">Report a wrong or outdated answer</button>';
    } catch (e) {
      const m = MD.colleges[String(id)] || {};
      box.innerHTML = "<p><b>You:</b> " + esc(question) + '</p><p class="cmx-warn">' + esc(e.message) + "</p>" +
        (m.urls && m.urls.web ? '<p class="cmx-small">Look it up on the <a href="' + esc(m.urls.web) + '" target="_blank" rel="noopener">official website</a>' + (m.urls.admissions ? ' or <a href="' + esc(m.urls.admissions) + '" target="_blank" rel="noopener">admissions office</a>' : "") + ".</p>" : "");
    }
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (loadErr) { root.innerHTML = '<p class="cmx-warn">The college data could not load. Check your connection and reload the page.</p>'; return; }
    if (!M || !CD || !MD) { root.innerHTML = '<p class="cmx-small" role="status">Loading college data…</p>'; return; }
    const focus = document.activeElement && root.contains(document.activeElement) ? (document.activeElement.dataset.field || document.activeElement.dataset.scn || null) : null;
    root.innerHTML = (S.view === "results" ? resultsView() : questionsView()) +
      '<p class="cmx-small cmx-privacy">Your answers are kept only in this browser. <button type="button" class="cmx-link" data-act="clear-all">Clear my answers</button></p>';
    if (focus) { const el = root.querySelector('[data-field="' + focus + '"],[data-scn="' + focus + '"]'); if (el) { el.focus(); const v = el.value; try { el.setSelectionRange(v.length, v.length); } catch (e) {} } }
  }

  // ---------------------------------------------------------------- events
  function fillDatalist(el, listId, values) {
    const dl = document.getElementById(listId); if (!dl) return;
    const q = el.value.toLowerCase(); if (q.length < 2) { dl.innerHTML = ""; return; }
    dl.innerHTML = values.filter((v) => v.toLowerCase().startsWith(q)).slice(0, 12).map((v) => '<option value="' + esc(v) + '">').join("");
  }
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.field) { S.A[t.dataset.field] = t.value; persist(); return; }
    if (t.dataset.text !== undefined) { S.text = t.value; persist(); return; }
    if (t.dataset.place !== undefined) { fillDatalist(t, "cmxPlaces", Object.keys(MD.places)); return; }
    if (t.dataset.whynot !== undefined) { fillDatalist(t, "cmxColleges", CD.colleges.map((c) => c.n)); return; }
    if (t.dataset.filterMajors !== undefined) { const q = t.value.toLowerCase(); root.querySelectorAll(".cmx-majors .cmx-opt").forEach((l) => { l.hidden = q && !l.textContent.toLowerCase().includes(q); }); return; }
    if (t.dataset.weight) { S.weights[t.dataset.weight] = Number(t.value); persist(); render(); return; }
    if (t.dataset.scn) { S.scenario = Object.assign({}, S.scenario || {}, { [t.dataset.scn]: t.value === "" ? null : num(t.value) }); if (S.scenario.sat == null && S.scenario.act == null) S.scenario = null; render(); return; }
    if (t.dataset.listnote) { const p = profile(); p.college = p.college || {}; p.college.list = p.college.list || {}; (p.college.list[t.dataset.listnote] = p.college.list[t.dataset.listnote] || {}).note = t.value; p.updatedAt = Date.now(); p.dirty = true; writeJson(PROFILE, p); }
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.multi && t.dataset.multi !== "proposal") {
      const k = t.dataset.multi, cur = new Set(S.A[k] || []);
      if (t.checked) cur.add(t.value); else cur.delete(t.value);
      if (k === "majors" && cur.size > 5) { t.checked = false; return; }
      if (k === "priorities") { if (cur.size > 3) { t.checked = false; return; } S.weights = {}; [...cur].forEach((c) => { S.weights[c] = 30; }); }
      S.A[k] = [...cur]; persist(); if (k === "majors") render(); return;
    }
    if (t.dataset.multi === "proposal") { S.proposals.proposals[Number(t.value)].on = t.checked; return; }
    if (t.dataset.single) { S.A[t.dataset.single] = t.value; persist(); render(); return; }
    if (t.dataset.flag) { S.A[t.dataset.flag] = t.checked; persist(); return; }
    if (t.dataset.imp) { t.dataset.imp.split(",").forEach((id) => { S.imp[id] = t.value; }); persist(); return; }
    if (t.dataset.field === "income") { S.A.income = t.value; persist(); return; }
    if (t.dataset.place !== undefined) {
      const label = t.value.trim(); const pt = MD.places[label];
      if (!pt) { t.setCustomValidity("Pick a city from the list, like \"Austin, TX\"."); t.reportValidity(); return; }
      t.setCustomValidity("");
      if (t.dataset.place === "home") S.A.home = { label, pt };
      else S.A.places = (S.A.places || []).concat([{ label, pt, miles: 100, importance: "important" }]);
      persist(); render(); return;
    }
    if (t.dataset.placemiles) { const p = S.A.places[Number(t.dataset.placemiles)]; p.miles = num(t.value) || 100; persist(); return; }
    if (t.dataset.placeimp) { S.A.places[Number(t.dataset.placeimp)].importance = t.value; persist(); return; }
    if (t.dataset.pq) { const qq = S.proposals.questions[Number(t.dataset.pq)]; if (t.value && MD.places[t.value]) S.proposals.proposals.push({ key: "place", value: { label: t.value, pt: MD.places[t.value], miles: 60, importance: "important" }, label: "Within about 60 miles of " + t.value, on: true }); qq.done = true; render(); return; }
    if (t.dataset.liststatus) { const p = profile(); p.college = p.college || {}; p.college.list = p.college.list || {}; (p.college.list[t.dataset.liststatus] = p.college.list[t.dataset.liststatus] || {}).status = t.value; p.updatedAt = Date.now(); p.dirty = true; writeJson(PROFILE, p); return; }
    if (t.dataset.whynot !== undefined) {
      const c = CD.colleges.find((x) => x.n.toLowerCase() === t.value.trim().toLowerCase()); const out = root.querySelector("[data-whynot-out]");
      if (!c) { out.textContent = "Pick a college from the list."; return; }
      const x = M.explain(c.id, compute());
      out.innerHTML = x.shown ? "<p>" + esc(c.n) + " is #" + x.rank + " in your best overall matches.</p>" :
        "<ul>" + (x.reasons.length ? x.reasons : ["It ranks below the colleges shown."]).map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
        '<button type="button" class="cmx-btn" data-details="' + c.id + '" data-inline="1">See its full breakdown</button><div class="cmx-detail" hidden></div>';
    }
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button, [data-section], [data-mode]"); if (!b) return;
    const act = b.dataset.act;
    if (b.dataset.mode) {
      // Stay on the same question when the depth changes; if it is not in the new depth, go to the next one that is.
      const cur = visible()[S.step], order = Q.map((q) => q.id);
      S.mode = b.dataset.mode;
      const vis = visible();
      let i = cur ? vis.findIndex((q) => q.id === cur.id) : -1;
      if (i < 0 && cur) i = vis.findIndex((q) => order.indexOf(q.id) > order.indexOf(cur.id));
      S.step = i < 0 ? vis.length - 1 : i;
      persist(); render(); return;
    }
    if (b.dataset.section) { S.section = b.dataset.section; persist(); render(); return; }
    if (act === "next") { S.step++; persist(); render(); root.querySelector("#cmxQ").focus?.(); return; }
    if (act === "back") { S.step = Math.max(0, S.step - 1); persist(); render(); return; }
    if (act === "skip") { const q = visible()[S.step]; delete S.A[q.id]; if (S.step < visible().length - 1) S.step++; else S.view = "results"; persist(); render(); return; }
    if (act === "results") { S.view = "results"; persist(); render(); root.scrollIntoView({ block: "start" }); return; }
    if (act === "edit") { S.view = "questions"; persist(); render(); return; }
    if (act === "interpret") { S.proposals = M.parseText(S.text, MD.places); render(); return; }
    if (act === "apply-text") { S.proposals.proposals.filter((x) => x.on !== false).forEach(applyProposal); S.proposals = null; persist(); render(); return; }
    if (act === "reset-weights") { S.weights = {}; persist(); render(); return; }
    if (act === "clear-scn") { S.scenario = null; render(); return; }
    if (act === "clear-compare") { S.compare = []; persist(); render(); return; }
    if (act === "clear-all") { try { localStorage.removeItem(KEY); } catch (err) {} Object.assign(S, { mode: "quick", step: 0, A: {}, imp: {}, weights: {}, view: "questions", section: "overall", text: "", proposals: null, compare: [], scenario: null }); render(); return; }
    if (act === "close-research") { b.closest(".cmx-research").remove(); return; }
    if (b.dataset.delplace) { S.A.places.splice(Number(b.dataset.delplace), 1); persist(); render(); return; }
    if (b.dataset.save) {
      const id = Number(b.dataset.save), p = profile(); p.college = p.college || {}; p.college.saved = p.college.saved || [];
      if (p.college.saved.includes(id)) p.college.saved = p.college.saved.filter((x) => x !== id); else p.college.saved.push(id);
      p.updatedAt = Date.now(); p.dirty = true; writeJson(PROFILE, p); b.textContent = p.college.saved.includes(id) ? "Saved" : "Save"; return;
    }
    if (b.dataset.compare) { const id = Number(b.dataset.compare); S.compare = S.compare.includes(id) ? S.compare.filter((x) => x !== id) : S.compare.concat([id]).slice(-4); persist(); render(); return; }
    if (b.dataset.details) {
      const id = Number(b.dataset.details), box = b.dataset.inline ? b.nextElementSibling : b.closest(".cmx-card").querySelector(".cmx-detail");
      if (!box.hidden) { box.hidden = true; return; }
      box.innerHTML = details(compute().all.find((x) => x.id === id)); box.hidden = false; return;
    }
    if (b.dataset.ask) { const card_ = b.closest(".cmx-card"); if (!card_.querySelector(".cmx-research")) card_.querySelector(".cmx-card-main").insertAdjacentHTML("beforeend", researchHtml(Number(b.dataset.ask))); card_.querySelector(".cmx-research textarea").focus(); return; }
    if (b.dataset.sugg) { const ta = b.closest(".cmx-research").querySelector("textarea"); ta.value = b.dataset.sugg; ta.focus(); return; }
    if (b.dataset.report) {
      const ans = b.closest(".cmx-answer"); const text = ans ? ans.querySelector(".cmx-ans-body").textContent.slice(0, 500) : "";
      fetch("/api/college-research/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: Number(b.dataset.report), answer: text }) }).catch(() => {});
      b.textContent = "Thanks: reported for review"; b.disabled = true; return;
    }
  });
  root.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-research]"); if (!f) return;
    e.preventDefault();
    const q = f.q.value.trim(); if (!q) return;
    f.q.value = "";
    ask(Number(f.dataset.research), q, f.parentElement.querySelector(".cmx-answers"));
  });

  render();
  ready.then(render);
})();
