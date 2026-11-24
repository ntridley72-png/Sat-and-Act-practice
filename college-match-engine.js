/* FunSAT college matcher engine. Deterministic: the same answers and data always give the same results.
 *
 * Three separate measures, never mixed:
 *   personal fit   - how well a college meets the student's own preferences, by category, with user weights;
 *   admissions     - Likely / Target / Reach / Uncertain from the college's reported score range and admit rate;
 *   affordability  - net price (for the student's income band when given) against their budget.
 * Plus evidence coverage: the share of the student's weighted preferences we could check with verified data. Unknown
 * facts never count as failures and never as successes; the fit range shows what they could change.
 *
 * Inputs: the college records from college-data.js (Scorecard) joined with college-match-data.js (IPEDS 2023).
 * Pure functions, no DOM. Browser: window.FunSATMatch; Node: module.exports. Tests: tests/college-match-engine.test.cjs.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FunSATMatch = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const VERSION = "match-2026-11-24";

  const CATEGORIES = {
    academic: { label: "Academic programs", weight: 20 },
    financial: { label: "Cost", weight: 20 },
    location: { label: "Location and setting", weight: 15 },
    career: { label: "Career and outcomes", weight: 15 },
    campus: { label: "Campus life", weight: 10 },
    flexibility: { label: "Academic flexibility", weight: 10 },
    transport: { label: "Getting around", weight: 5 },
    support: { label: "Student support", weight: 5 },
  };
  const IMPORTANCE = { must: { w: 3, hard: true, label: "Must have" }, dealbreaker: { w: 3, hard: true, label: "Dealbreaker if not met" },
    very: { w: 3, label: "Very important" }, important: { w: 2, label: "Important" }, nice: { w: 1, label: "Nice to have" }, none: { w: 0, label: "No preference" } };
  const REGIONS = {
    northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
    midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
    south: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
    west: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
  };
  const SETTING = (loc) => (!loc ? null : loc[0] === "1" ? "city" : loc[0] === "2" ? "suburb" : loc[0] === "3" ? "town" : "rural");
  const SIZE = (enr) => (enr == null ? null : enr < 5000 ? "small" : enr <= 15000 ? "medium" : "large");
  const BANDS = ["$0-$30,000", "$30,001-$48,000", "$48,001-$75,000", "$75,001-$110,000", "$110,000+"];

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  function miles(a, b) {
    const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.sqrt(h));
  }
  const res = (status, score, detail, extra) => Object.assign({ status, score, detail }, extra || {});
  const unknown = (detail) => res("unknown", null, detail);
  const yesNo = (v, yes, no, what) => (v === true ? res("met", 1, yes) : v === false ? res("unmet", 0, no) : unknown(what + " was not reported."));

  /** Net price the student is likely to see: their income band when given, otherwise the average. */
  function netPrice(c, money_) {
    const band = money_ && Number.isInteger(money_.incomeBand) ? money_.incomeBand : null;
    if (band != null && Array.isArray(c.bands) && c.bands[band] && isNum(c.bands[band][1])) return { value: c.bands[band][1], basis: "for families earning " + BANDS[band] };
    if (isNum(c.np)) return { value: c.np, basis: "average for first-year students with aid" };
    return null;
  }

  // ---------------------------------------------------------------- criteria
  // Each: id, cat, active(prefs) -> bool, evaluate(c, m, prefs) -> {status, score 0..1 or null, detail}.
  const CRITERIA = [
    { id: "major", cat: "academic", label: "Offers your intended major",
      active: (p) => (p.academics.majors || []).length > 0,
      evaluate: (c, m, p, D) => {
        if (!m || !Array.isArray(m.cip)) return unknown("Program data not available.");
        const offered = (key) => { const mj = D.majors[key]; return mj && mj.cip.some((pre) => m.cip.some((x) => x.startsWith(pre))); };
        const keys = p.academics.majors, hit = keys.filter(offered);
        const names = (ks) => ks.map((k) => (D.majors[k] || {}).label || k).join(", ");
        if (hit.length === keys.length) return res("met", 1, "Awarded bachelor's degrees in " + names(hit) + " (2022-23).");
        if (hit.length) return res("partial", hit.length / keys.length, "Awarded degrees in " + names(hit) + " but none reported in " + names(keys.filter((k) => !hit.includes(k))) + " (2022-23).");
        return res("unmet", 0, "No bachelor's degrees reported in " + names(keys) + " in 2022-23. A new or very small program could be missing.");
      } },
    { id: "prof", cat: "academic", label: "Professional school on campus",
      active: (p) => !!p.academics.professional,
      evaluate: (c, m, p, D) => !m ? unknown("Not available.") : (m.prof || []).includes(p.academics.professional)
        ? res("met", 1, D.professional[p.academics.professional] + " awarded on this campus (2022-23).")
        : res("unmet", 0, "No " + D.professional[p.academics.professional] + " degrees reported here. You can still complete prerequisites and apply elsewhere.") },
    { id: "sfr", cat: "academic", label: "Small classes (student-to-faculty ratio)",
      active: (p) => isNum(p.academics.maxRatio),
      evaluate: (c, m, p) => !isNum(c.sfr) ? unknown("Ratio not reported.") : c.sfr <= p.academics.maxRatio ? res("met", 1, c.sfr + " students per faculty member.")
        : res(c.sfr <= p.academics.maxRatio * 1.3 ? "partial" : "unmet", Math.max(0, 1 - (c.sfr - p.academics.maxRatio) / p.academics.maxRatio), c.sfr + " students per faculty member (you wanted " + p.academics.maxRatio + " or fewer).") },
    { id: "gradrate", cat: "academic", label: "High graduation rate",
      active: (p) => isNum(p.academics.minGradRate),
      evaluate: (c, m, p) => !isNum(c.gr) ? unknown("Graduation rate not reported.") : c.gr >= p.academics.minGradRate ? res("met", 1, Math.round(c.gr) + "% graduate within six years.")
        : res("unmet", Math.max(0, c.gr / p.academics.minGradRate - 0.3), Math.round(c.gr) + "% graduate within six years (you wanted " + p.academics.minGradRate + "%+).") },
    { id: "research", cat: "academic", label: "Undergraduate research programs",
      active: (p) => !!p.academics.research,
      evaluate: (c, m) => yesNo(m && m.ugResearch, "Reports a co-curricular undergraduate research program.", "Does not report a co-curricular undergraduate research program to IPEDS (research with faculty may still exist).", "Undergraduate research") },

    { id: "budget", cat: "financial", label: "Within your budget",
      active: (p) => isNum(p.money.budget),
      evaluate: (c, m, p) => {
        const np = netPrice(c, p.money); if (!np) return unknown("Net price not reported. Use the college's net price calculator.");
        if (np.value <= p.money.budget) return res("met", 1, "Net price about " + money(np.value) + "/year " + np.basis + ", within your " + money(p.money.budget) + ".");
        const over = np.value - p.money.budget;
        return res(over <= p.money.budget * 0.15 ? "partial" : "unmet", Math.max(0, 1 - over / p.money.budget), "Net price about " + money(np.value) + "/year " + np.basis + ", " + money(over) + " over your budget.");
      } },
    { id: "instate", cat: "financial", label: "In-state public tuition",
      active: (p) => !!p.money.inState && !!p.money.homeState,
      evaluate: (c, m, p) => c.ctrl === "public" && c.st === p.money.homeState ? res("met", 1, "Public college in your home state.")
        : res("unmet", 0, c.ctrl === "public" ? "Public, but outside your home state (out-of-state tuition " + (isNum(c.to) ? money(c.to) : "not reported") + ")." : "Private college: no in-state rate.") },
    { id: "debt", cat: "financial", label: "Low student debt",
      active: (p) => isNum(p.money.maxDebt),
      evaluate: (c, m, p) => !isNum(c.debt) ? unknown("Median debt not reported.") : c.debt <= p.money.maxDebt ? res("met", 1, "Median federal debt at graduation " + money(c.debt) + ".")
        : res("unmet", Math.max(0, 1 - (c.debt - p.money.maxDebt) / p.money.maxDebt), "Median federal debt at graduation " + money(c.debt) + " (above " + money(p.money.maxDebt) + ").") },

    { id: "region", cat: "location", label: "In your preferred states or regions",
      active: (p) => (p.place.states || []).length + (p.place.regions || []).length > 0,
      evaluate: (c, m, p) => {
        const ok = (p.place.states || []).includes(c.st) || (p.place.regions || []).some((r) => (REGIONS[r] || []).includes(c.st));
        return ok ? res("met", 1, "Located in " + c.st + ".") : res("unmet", 0, "Located in " + c.st + ", outside the states and regions you chose.");
      } },
    { id: "setting", cat: "location", label: "Campus setting",
      active: (p) => (p.place.settings || []).length > 0,
      evaluate: (c, m, p, D) => {
        const s = SETTING((m && m.loc) || null); if (!s) return unknown("Setting not reported.");
        const label = D.locale[m.loc] || s;
        return p.place.settings.includes(s) ? res("met", 1, label + " setting (IPEDS).") : res("unmet", 0, label + " setting, not one you chose.");
      } },
    { id: "size", cat: "location", label: "College size",
      active: (p) => (p.place.sizes || []).length > 0,
      evaluate: (c, m, p) => {
        const s = SIZE(c.enr); if (!s) return unknown("Enrollment not reported.");
        return p.place.sizes.includes(s) ? res("met", 1, Number(c.enr).toLocaleString("en-US") + " undergraduates (" + s + ").") : res("unmet", 0, Number(c.enr).toLocaleString("en-US") + " undergraduates (" + s + "), not a size you chose.");
      } },
    { id: "places", cat: "location", label: "Close to places that matter to you",
      active: (p) => (p.place.places || []).length > 0,
      evaluate: (c, m, p) => {
        if (!m || !m.pt) return unknown("Campus location not available.");
        let total = 0, got = 0; const parts = [];
        for (const pl of p.place.places) {
          const w = IMPORTANCE[pl.importance || "important"].w || 1, d = miles(m.pt, pl.pt);
          const s = d <= pl.miles ? 1 : d <= pl.miles * 1.5 ? 0.5 : 0;
          total += w; got += w * s;
          parts.push(Math.round(d) + " mi straight-line to " + pl.label + (s === 1 ? "" : " (you wanted " + pl.miles + ")"));
        }
        const score = total ? got / total : 0;
        return res(score === 1 ? "met" : score > 0 ? "partial" : "unmet", score, parts.join("; ") + ". Driving distance is longer.");
      } },
    { id: "bigcity", cat: "location", label: "Near a large city",
      active: (p) => isNum(p.place.bigCityMiles),
      evaluate: (c, m, p) => !m || !isNum(m.bigMi) ? unknown("Location not available.") : m.bigMi <= p.place.bigCityMiles
        ? res("met", 1, (m.bigMi < 5 ? "In or next to " : m.bigMi + " mi straight-line to ") + m.bigCity + ".")
        : res(m.bigMi <= p.place.bigCityMiles * 1.5 ? "partial" : "unmet", Math.max(0, 1 - (m.bigMi - p.place.bigCityMiles) / (p.place.bigCityMiles * 2)), m.bigMi + " mi straight-line to the nearest large city (" + m.bigCity + ").") },
    { id: "awayFromHome", cat: "location", label: "Distance from home",
      active: (p) => !!p.place.home && (isNum(p.place.minFromHome) || isNum(p.place.maxFromHome)),
      evaluate: (c, m, p) => {
        if (!m || !m.pt) return unknown("Campus location not available.");
        const d = miles(m.pt, p.place.home.pt), lo = p.place.minFromHome || 0, hi = isNum(p.place.maxFromHome) ? p.place.maxFromHome : Infinity;
        return d >= lo && d <= hi ? res("met", 1, Math.round(d) + " mi straight-line from home.") : res("unmet", 0, Math.round(d) + " mi straight-line from home (you wanted " + (lo ? lo + "+" : "") + (lo && hi < Infinity ? " and " : "") + (hi < Infinity ? "under " + hi : "") + ").");
      } },

    { id: "earnings", cat: "career", label: "Graduates' earnings",
      active: (p) => isNum(p.career.minEarnings),
      evaluate: (c, m, p) => !isNum(c.ern) ? unknown("Earnings not reported.") : c.ern >= p.career.minEarnings ? res("met", 1, "Median earnings " + money(c.ern) + " ten years after entry.")
        : res("unmet", Math.max(0, c.ern / p.career.minEarnings - 0.3), "Median earnings " + money(c.ern) + " ten years after entry (you wanted " + money(p.career.minEarnings) + "+).") },
    { id: "hospital", cat: "career", label: "Hospital or medical school on campus",
      active: (p) => !!p.career.hospital,
      evaluate: (c, m) => !m ? unknown("Not available.") : (m.hospital || m.medical) ? res("met", 1, (m.hospital ? "Operates a hospital" : "Has a medical school") + " (IPEDS). Ask about undergraduate jobs and shadowing.")
        : m.hospital === false && m.medical === false ? res("unmet", 0, "No university hospital or medical school reported; nearby hospitals are not in our data.") : unknown("Not reported.") },
    { id: "jobs", cat: "career", label: "Student employment services",
      active: (p) => !!p.career.jobServices,
      evaluate: (c, m) => yesNo(m && m.jobServices, "Offers employment services for students (IPEDS).", "Does not report employment services for students.", "Employment services") },

    { id: "control", cat: "campus", label: "Public or private",
      active: (p) => !!p.campus.control && p.campus.control !== "any",
      evaluate: (c, m, p) => c.ctrl === p.campus.control ? res("met", 1, c.ctrl === "public" ? "Public college." : "Private nonprofit college.") : res("unmet", 0, c.ctrl === "public" ? "Public, not private." : "Private, not public.") },
    { id: "religion", cat: "campus", label: "Religious affiliation",
      active: (p) => !!p.campus.religion && p.campus.religion !== "any",
      evaluate: (c, m, p) => !m || m.religious == null ? unknown("Affiliation not reported.") : p.campus.religion === "prefer"
        ? (m.religious ? res("met", 1, "Religiously affiliated (IPEDS).") : res("unmet", 0, "No religious affiliation."))
        : (m.religious ? res("unmet", 0, "Religiously affiliated (IPEDS).") : res("met", 1, "No religious affiliation.")) },
    { id: "athletics", cat: "campus", label: "Big-time college sports",
      active: (p) => !!p.campus.athletics,
      evaluate: (c, m) => !m ? unknown("Not available.") : m.ncaa && m.football ? res("met", 1, "NCAA member with football.") : m.ncaa ? res("partial", 0.6, "NCAA member, no football.") : m.ncaa === false ? res("unmet", 0, "Not an NCAA member.") : unknown("Athletics association not reported.") },
    { id: "housing", cat: "campus", label: "On-campus housing",
      active: (p) => !!p.campus.housing,
      evaluate: (c, m) => yesNo(m && m.housing, "Offers college-run housing" + (m && m.roomCap ? " for about " + m.roomCap.toLocaleString("en-US") + " students" : "") + ".", "No college-run housing.", "Housing") },
    { id: "liveOff", cat: "campus", label: "First-years free to live off campus",
      active: (p) => !!p.campus.freedomToLiveOff,
      evaluate: (c, m) => !m || m.mustLiveOn == null ? unknown("Not reported.") : m.mustLiveOn ? res("unmet", 0, "Full-time first-years are required to live on campus (exemptions may exist).") : res("met", 1, "First-years are not required to live on campus.") },
    { id: "hbcu", cat: "campus", label: "Historically Black college or university",
      active: (p) => !!p.campus.hbcu,
      evaluate: (c) => c.hbcu ? res("met", 1, "HBCU.") : res("unmet", 0, "Not an HBCU.") },

    { id: "undecided", cat: "flexibility", label: "Lots of majors to explore",
      active: (p) => !!p.academics.undecided,
      evaluate: (c, m) => {
        if (!m || !Array.isArray(m.cip)) return unknown("Program data not available.");
        const fams = new Set(m.cip.map((x) => x.slice(0, 2))).size;
        const s = Math.min(1, fams / 25);
        return res(s >= 0.8 ? "met" : s >= 0.45 ? "partial" : "unmet", s, "Awarded bachelor's degrees in " + fams + " broad fields (2022-23). Ask how and when you declare a major.");
      } },
    { id: "ap", cat: "flexibility", label: "Accepts AP credit",
      active: (p) => !!p.flex.apCredit,
      evaluate: (c, m) => yesNo(m && m.apCredit, "Accepts AP credit (scores and courses vary; check its AP policy).", "Reports that it does not accept AP credit.", "AP credit") },
    { id: "abroad", cat: "flexibility", label: "Study abroad",
      active: (p) => !!p.flex.abroad,
      evaluate: (c, m) => yesNo(m && m.abroad, "Offers study abroad.", "Does not report study abroad.", "Study abroad") },
    { id: "online", cat: "flexibility", label: "Some courses online",
      active: (p) => !!p.flex.online,
      evaluate: (c, m) => yesNo(m && m.online, "Offers undergraduate courses online.", "Does not report online undergraduate courses.", "Online courses") },

    { id: "carfree", cat: "transport", label: "Workable without a car",
      active: (p) => !!p.transport.noCar,
      // No transit data: the setting is only a hint, so this never counts as "met".
      evaluate: (c, m) => { const s = SETTING(m && m.loc); return !s ? unknown("Setting not reported.") : s === "city" ? res("partial", 0.7, "City setting: often workable without a car, but we have no transit data. Check buses and shuttles.", { estimate: true })
        : s === "suburb" ? res("partial", 0.45, "Suburban setting: check campus shuttles and transit before relying on them.", { estimate: true }) : res("partial", 0.15, "Town or rural setting: a car is often needed. Check shuttles.", { estimate: true }); } },

    { id: "counseling", cat: "support", label: "Academic and career counseling",
      active: (p) => !!p.support.counseling,
      evaluate: (c, m) => yesNo(m && m.counseling, "Offers academic/career counseling (IPEDS).", "Does not report academic/career counseling.", "Counseling") },
    { id: "veterans", cat: "support", label: "Military benefits (Yellow Ribbon)",
      active: (p) => !!p.support.yellowRibbon,
      evaluate: (c, m) => yesNo(m && m.yellowRibbon, "Participates in the Yellow Ribbon Program (2023-24). Seats and amounts are limited; confirm with the veterans office.", "Does not report Yellow Ribbon participation.", "Yellow Ribbon participation") },
    { id: "rotc", cat: "support", label: "ROTC",
      active: (p) => !!p.support.rotc,
      evaluate: (c, m) => yesNo(m && m.rotc, "Offers ROTC" + (m ? " (" + ["Army", "Navy", "Air Force"].filter((_, i) => [m.rotcArmy, m.rotcNavy, m.rotcAF][i]).join(", ") + ")" : "") + ".", "Does not report ROTC (cross-town programs may exist).", "ROTC") },
    { id: "childcare", cat: "support", label: "Child care for students",
      active: (p) => !!p.support.childCare,
      evaluate: (c, m) => yesNo(m && m.childCare, "Offers on-campus day care for students' children.", "Does not report on-campus child care.", "Child care") },
  ];
  const CRITERION = Object.fromEntries(CRITERIA.map((c) => [c.id, c]));

  /** Fill every section of a preferences object so callers can send partial answers. */
  function normalize(p) {
    p = p || {};
    const o = (x) => (x && typeof x === "object" ? x : {});
    return {
      academics: Object.assign({ majors: [] }, o(p.academics)), money: o(p.money), place: Object.assign({ states: [], regions: [], settings: [], sizes: [], places: [] }, o(p.place)),
      career: o(p.career), campus: o(p.campus), flex: o(p.flex), transport: o(p.transport), support: o(p.support),
      importance: o(p.importance), weights: o(p.weights),
    };
  }

  /** Category weights: user values (0 excludes a category), normalized over active categories to 100. */
  function categoryWeights(p, activeCats) {
    const raw = {};
    for (const k of activeCats) { const v = p.weights[k]; raw[k] = isNum(v) && v >= 0 ? v : CATEGORIES[k].weight; }
    const sum = Object.values(raw).reduce((a, b) => a + b, 0);
    const out = {};
    for (const k of activeCats) out[k] = sum > 0 ? (raw[k] / sum) * 100 : 0;
    return out;
  }

  // ---------------------------------------------------------------- admissions (separate from fit)
  function admissions(c, acad, concordance) {
    const adm = c.adm;
    const notes = ["Ranges describe enrolled students, not admission cutoffs. Colleges do not report GPA ranges to the federal government, so GPA is not compared here."];
    if (isNum(adm) && adm < 15) return { label: "Reach", basis: "Admits " + adm + "% of applicants: a reach for every applicant.", notes };
    let score = null, lo, hi, test;
    const sat = isNum(acad.sat) ? acad.sat : null, act = isNum(acad.act) ? acad.act : null;
    if (!acad.testOptional) {
      if (sat != null && isNum(c.sr25)) { score = sat; lo = c.sr25; hi = c.sr75; test = "SAT"; }
      else if (act != null && isNum(c.ar25)) { score = act; lo = c.ar25; hi = c.ar75; test = "ACT"; }
      else if (act != null && isNum(c.sr25) && concordance && concordance[String(act)]) { score = concordance[String(act)]; lo = c.sr25; hi = c.sr75; test = "SAT (converted from your ACT)"; }
    }
    if (score == null) return { label: "Uncertain", basis: acad.testOptional ? "Applying test-optional: we can't place you without a score. Admit rate " + (isNum(adm) ? adm + "%" : "not reported") + "." : "No comparable score " + (isNum(c.sr25) || isNum(c.ar25) ? "from you" : "range reported by the college") + ".", notes };
    const pos = (score - lo) / Math.max(1, hi - lo);
    const where = pos >= 1 ? "at or above the 75th percentile" : pos >= 0 ? "inside the middle 50%" : "below the 25th percentile";
    const basis = "Your " + test + " " + score + " is " + where + " (" + lo + "-" + hi + "); admit rate " + (isNum(adm) ? adm + "%" : "not reported") + ".";
    let label;
    if (!isNum(adm)) label = "Uncertain";
    else if (pos >= 1) label = adm >= 50 ? "Likely" : adm >= 25 ? "Target" : "Reach";
    else if (pos >= 0) label = adm >= 70 ? "Likely" : adm >= 25 ? "Target" : "Reach";
    else label = adm >= 80 ? "Target" : "Reach";
    return { label, basis, position: pos, notes };
  }

  function affordability(c, p) {
    const np = netPrice(c, p.money);
    if (!np) return { label: "Unknown", detail: "Net price not reported." };
    if (!isNum(p.money.budget)) return { label: "No budget set", value: np.value, detail: money(np.value) + "/year " + np.basis + "." };
    const diff = np.value - p.money.budget;
    return diff <= 0 ? { label: "Within budget", value: np.value, detail: money(np.value) + "/year " + np.basis + "." }
      : { label: diff <= p.money.budget * 0.15 ? "Slightly over budget" : "Over budget", value: np.value, over: diff, detail: money(np.value) + "/year " + np.basis + ", " + money(diff) + " over." };
  }

  /** Evaluate one college. c: college-data record, m: match-data record, D: match-data meta, conc: actToSat table. */
  function evaluate(c, m, prefs, D, conc) {
    const p = normalize(prefs);
    const active = CRITERIA.filter((k) => k.active(p)).map((k) => ({ k, imp: IMPORTANCE[p.importance[k.id]] ? p.importance[k.id] : "important" })).filter((x) => x.imp !== "none");
    const cats = {};
    const items = active.map(({ k, imp }) => {
      const r = k.evaluate(c, m, p, D);
      return Object.assign({ id: k.id, cat: k.cat, label: k.label, importance: imp, w: IMPORTANCE[imp].w, hard: !!IMPORTANCE[imp].hard }, r);
    });
    for (const it of items) {
      const cc = cats[it.cat] || (cats[it.cat] = { wAll: 0, wKnown: 0, got: 0 });
      cc.wAll += it.w;
      if (it.status !== "unknown") { cc.wKnown += it.w; cc.got += it.w * it.score; }
    }
    const W = categoryWeights(p, Object.keys(cats));
    let fit = 0, fitW = 0, low = 0, high = 0, cover = 0;
    const categories = {};
    for (const [k, v] of Object.entries(cats)) {
      const known = v.wKnown ? v.got / v.wKnown : null;
      categories[k] = { label: CATEGORIES[k].label, weight: W[k], score: known, coverage: v.wAll ? v.wKnown / v.wAll : 0 };
      if (known != null) { fit += W[k] * known; fitW += W[k]; }
      low += W[k] * (v.got / v.wAll);
      high += W[k] * ((v.got + (v.wAll - v.wKnown)) / v.wAll);
      cover += W[k] * (v.wAll ? v.wKnown / v.wAll : 0);
    }
    // A requirement is a requirement: falling short at all fails it. Estimates (no verified data) need checking instead.
    const hardFail = items.filter((i) => i.hard && (i.status === "unmet" || (i.status === "partial" && !i.estimate)));
    const hardUnknown = items.filter((i) => i.hard && (i.status === "unknown" || (i.status === "partial" && i.estimate)));
    const adm = admissions(c, p.academics, conc);
    const aff = affordability(c, p);
    const strengths = items.filter((i) => i.status === "met" && i.w >= 2).sort((a, b) => b.w - a.w).map((i) => i.detail);
    const concerns = items.filter((i) => (i.status === "unmet" || i.status === "partial") && i.w >= 1).sort((a, b) => b.w - a.w || a.score - b.score).map((i) => i.detail);
    if (aff.label === "Over budget" || aff.label === "Slightly over budget") { if (!concerns.some((x) => x.includes("over your budget"))) concerns.push(aff.detail); }
    if (adm.label === "Reach") concerns.push("Admissions: " + adm.basis);
    const unknowns = items.filter((i) => i.status === "unknown").map((i) => i.label + ": " + i.detail);
    return {
      id: c.id, name: c.n, st: c.st, city: c.city,
      fit: fitW ? Math.round(fit / fitW * 100) / 100 : null, fitLow: Math.round(low) / 100, fitHigh: Math.round(high) / 100,
      coverage: Math.round(cover) / 100, categories, items, excluded: hardFail.length > 0, hardFail, hardUnknown,
      admissions: adm, affordability: aff, strengths, concerns, unknowns, version: VERSION,
    };
  }

  /** Evaluate and group all colleges. Ties break by evidence coverage, then by id, so order never depends on input order. */
  function rank(colleges, matchData, prefs, opts) {
    opts = opts || {};
    const D = matchData.meta, conc = opts.concordance || null;
    const all = colleges.map((c) => evaluate(c, matchData.colleges[String(c.id)], prefs, D, conc));
    const byFit = (a, b) => (b.fit ?? -1) - (a.fit ?? -1) || b.coverage - a.coverage || a.id - b.id;
    const ok = all.filter((r) => !r.excluded && !r.hardUnknown.length && r.fit != null).sort(byFit);
    const catTop = (k) => ok.filter((r) => r.categories[k] && r.categories[k].score != null).sort((a, b) => b.categories[k].score - a.categories[k].score || byFit(a, b));
    const enr = Object.fromEntries(colleges.map((c) => [c.id, c.enr]));
    const admOf = Object.fromEntries(colleges.map((c) => [c.id, c.adm]));
    const sections = {
      overall: ok.slice(0, opts.limit || 25),
      affordable: ok.filter((r) => r.affordability.label === "Within budget"),
      career: catTop("career"), lifestyle: catTop("location"), academic: catTop("academic"),
      reach: ok.filter((r) => r.admissions.label === "Reach"),
      likely: ok.filter((r) => r.admissions.label === "Likely"),
      // Strong fit at colleges that are easier to get into and not among the largest: names students may not know yet.
      overlooked: ok.filter((r) => isNum(admOf[r.id]) && admOf[r.id] >= 50 && isNum(enr[r.id]) && enr[r.id] < 12000 && r.fit >= 0.7),
      verify: all.filter((r) => !r.excluded && r.hardUnknown.length).sort(byFit),
      excluded: all.filter((r) => r.excluded).sort(byFit),
    };
    return { all, sections, version: VERSION };
  }

  /** Why a given college is not in the main list (or where it ranks). */
  function explain(id, ranked) {
    const r = ranked.all.find((x) => x.id === id);
    if (!r) return { found: false };
    const ok = ranked.sections.overall;
    const pos = [...ranked.all].filter((x) => !x.excluded && !x.hardUnknown.length && x.fit != null).sort((a, b) => (b.fit - a.fit) || b.coverage - a.coverage || a.id - b.id).findIndex((x) => x.id === id);
    const reasons = [];
    r.hardFail.forEach((i) => reasons.push("Fails a requirement you marked " + IMPORTANCE[i.importance].label.toLowerCase() + ": " + i.detail));
    r.hardUnknown.forEach((i) => reasons.push("Can't verify a requirement (" + i.label + "): " + i.detail));
    if (!r.excluded && !r.hardUnknown.length && pos >= ok.length) {
      const last = ok[ok.length - 1];
      reasons.push("Ranks #" + (pos + 1) + " by fit (" + Math.round(r.fit * 100) + " vs " + Math.round(last.fit * 100) + " for the last college shown).");
      Object.entries(r.categories).filter(([, v]) => v.score != null && v.score < 0.6).forEach(([, v]) => reasons.push(v.label + " scored " + Math.round(v.score * 100) + "/100."));
    }
    if (r.coverage < 0.6) reasons.push("Only " + Math.round(r.coverage * 100) + "% of your preferences could be checked with verified data.");
    return { found: true, result: r, rank: pos >= 0 ? pos + 1 : null, shown: pos >= 0 && pos < ok.length, reasons };
  }

  // ---------------------------------------------------------------- free-text preferences (no AI needed)
  const MAJOR_WORDS = [
    [/\bpre[- ]?pharm\w*|\bpharmac(y|ist|ology|eutical)/i, { majors: ["pharmsci", "chemistry", "biology"], professional: "pharmd" }, "Pharmacy pathway: chemistry, biology, pharmaceutical sciences; PharmD school on campus"],
    [/\bpre[- ]?med\b|\bmedical school\b|\bdoctor\b/i, { majors: ["biology", "chemistry"], professional: "md" }, "Pre-med: biology and chemistry; medical school on campus"],
    [/\bpre[- ]?law\b|\blaw school\b|\blawyer\b/i, { majors: ["polisci", "history"], professional: "jd" }, "Pre-law: political science, history; law school on campus"],
    [/\bbio(logy)?\b|life science/i, { majors: ["biology"] }, "Biology"], [/\bmarine bio/i, { majors: ["marinebio"] }, "Marine biology"],
    [/\bchem(istry)?\b/i, { majors: ["chemistry"] }, "Chemistry"], [/\bnurs(e|ing)\b/i, { majors: ["nursing"] }, "Nursing"],
    [/\bcomputer science\b|\bcoding\b|\bprogramming\b|\bsoftware\b|\bcs\b/i, { majors: ["cs"] }, "Computer science"],
    [/\bcyber\w*/i, { majors: ["it"] }, "Cybersecurity and IT"], [/\bdata science\b/i, { majors: ["datasci"] }, "Data science"],
    [/\bmechanical\b/i, { majors: ["mecheng"] }, "Mechanical engineering"], [/\belectrical\b/i, { majors: ["eleceng"] }, "Electrical engineering"],
    [/\baerospace\b/i, { majors: ["aeroeng"] }, "Aerospace engineering"], [/\bengineer(ing)?\b/i, { majors: ["engineering"] }, "Engineering"],
    [/\bpsych(ology)?\b/i, { majors: ["psych"] }, "Psychology"], [/\bbusiness\b/i, { majors: ["business"] }, "Business"],
    [/\bfinance\b/i, { majors: ["finance"] }, "Finance"], [/\baccounting\b/i, { majors: ["accounting"] }, "Accounting"],
    [/\becon(omics)?\b/i, { majors: ["econ"] }, "Economics"], [/\bteach(er|ing)?\b|\beducation major/i, { majors: ["education"] }, "Education"],
    [/\bart\b|\bstudio art/i, { majors: ["art"] }, "Art"], [/\bmusic\b/i, { majors: ["music"] }, "Music"], [/\bfilm\b/i, { majors: ["film"] }, "Film"],
    [/\bkinesiology\b|\bexercise science\b|\bphysical therapy\b/i, { majors: ["kines"] }, "Kinesiology"], [/\bneuroscience\b/i, { majors: ["neuro"] }, "Neuroscience"],
  ];
  const UNSUPPORTED = [
    [/\bbeach(es)?\b|\bocean\b|\bcoast(al)?\b|\bsurf/i, "Near a beach or coast"], [/\bski(ing)?\b|\bsnowboard/i, "Near skiing"],
    [/\bmountains?\b|\bhik(e|ing)\b|\bcamping\b/i, "Mountains and hiking"], [/\bsunny\b|\bwarm\b|\bsnow\b|\bweather\b|\bclimate\b/i, "Climate"],
    [/\bsocial\b|\bparty\b|\bnightlife\b|\bgreek\b|\bfrat/i, "Social scene and Greek life"], [/\bairport\b|\bflights?\b/i, "Airport access"],
    [/\bconcerts?\b|\brestaurants?\b|\bshopping\b/i, "Things to do off campus"],
  ];
  /** Suggestions from a written description. Nothing is applied until the student confirms it.
   *  places: {"City, ST": [lat, lon]} index. Returns {proposals:[{key, value, label, text}], unsupported:[...], questions:[...]}. */
  function parseText(text, places) {
    const t = String(text || "").slice(0, 2000), out = [], unsupported = [], questions = [];
    const add = (key, value, label, m) => { if (!out.some((o) => o.key === key && JSON.stringify(o.value) === JSON.stringify(value))) out.push({ key, value, label, text: m }); };
    for (const [re, v, label] of MAJOR_WORDS) {
      const m = t.match(re); if (!m) continue;
      add("majors", v.majors, "Interested in: " + label, m[0]);
      if (v.professional) add("professional", v.professional, "Prefer a campus with that professional school", m[0]);
    }
    if (/\bundecided\b|\bnot sure (what|which) (to )?major|\bdon'?t know what (i want to|to) (study|major)/i.test(t)) add("undecided", true, "Undecided: lots of majors to explore", "undecided");
    const settings = [];
    if (/\b(big )?cit(y|ies)\b|\burban\b/i.test(t)) settings.push("city");
    if (/\bsuburb/i.test(t)) settings.push("suburb");
    if (/\bsmall town\b|\bcollege town\b/i.test(t)) settings.push("town");
    if (/\brural\b|\bcountryside\b/i.test(t)) settings.push("rural");
    if (settings.length) add("settings", settings, "Setting: " + settings.join(", "), settings.join(", "));
    if (/\bsmall (school|college|campus)\b/i.test(t)) add("sizes", ["small"], "Size: small", "small school");
    if (/\b(big|large) (school|university|campus)\b/i.test(t)) add("sizes", ["large"], "Size: large", "large school");
    const b = t.match(/\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s?k)\b(?=[^.]{0,40}(year|budget|afford|cost|spend|per))|(?:budget|afford|spend|under|less than|max(?:imum)?)\D{0,20}\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s?k)/i);
    if (b) { const raw = (b[1] || b[3]).toLowerCase().replace(/[,\s$]/g, ""); const v = raw.endsWith("k") ? parseFloat(raw) * 1000 : parseFloat(raw); if (v >= 3000 && v <= 100000) add("budget", v, "Budget: about $" + v.toLocaleString("en-US") + " a year", b[0]); }
    if (/\b(no|don'?t (have|own) a|without a) car\b/i.test(t)) add("noCar", true, "No car: getting around without one", "no car");
    if (/\bresearch\b/i.test(t)) add("research", true, "Undergraduate research", "research");
    if (/\bstudy abroad\b/i.test(t)) add("abroad", true, "Study abroad", "study abroad");
    if (/\b(part[- ]time|work|job)\b/i.test(t)) add("jobServices", true, "Work while in college: student employment services", "work");
    if (/\bhospital\b/i.test(t)) add("hospital", true, "Hospital or medical school on campus", "hospital");
    if (/\bgi bill\b|\bmilitary\b|\bveteran\b|\byellow ribbon\b/i.test(t)) add("yellowRibbon", true, "Military benefits: Yellow Ribbon", "military");
    if (/\brotc\b/i.test(t)) add("rotc", true, "ROTC", "ROTC");
    if (/\bhbcu\b/i.test(t)) add("hbcu", true, "HBCU", "HBCU");
    if (/\bnot religious\b|\bsecular\b/i.test(t)) add("religion", "avoid", "No religious affiliation", "secular");
    else if (/\b(christian|catholic|religious|faith|jesuit|baptist|lutheran|methodist)\b/i.test(t)) add("religion", "prefer", "Religiously affiliated", "faith");
    if (/\bpublic\b/i.test(t) && !/\bpublic transport/i.test(t)) add("control", "public", "Public college", "public");
    // Places: "near Denver", "in San Diego", "family lives in Austin" -> a place index lookup; ambiguous names become a question.
    const names = new Set();
    const placeRe = /\b(?:near|in|close to|around|by|lives? in|goes to (?:college|school) in|attends .{0,30}? in)\s+([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+){0,2})(?:,\s*([A-Z]{2}))?/g;
    let mm;
    while ((mm = placeRe.exec(t))) {
      const city = mm[1].replace(/\.$/, ""), st = mm[2];
      if (/^(The|A|My|College|School|State|University)$/.test(city)) continue;
      const keys = Object.keys(places || {}).filter((k) => k.toLowerCase().startsWith(city.toLowerCase() + ",") && (!st || k.endsWith(", " + st)));
      if (keys.length === 1 && !names.has(keys[0])) { names.add(keys[0]); add("place", { label: keys[0], pt: places[keys[0]], miles: 60, importance: "important" }, "Within about 60 miles of " + keys[0], mm[0]); }
      else if (keys.length > 1) questions.push({ key: "place", text: "Which " + city + " did you mean?", options: keys.slice(0, 8) });
    }
    for (const [re, label] of UNSUPPORTED) if (re.test(t)) unsupported.push(label);
    return { proposals: out, unsupported, questions };
  }

  return { VERSION, CATEGORIES, IMPORTANCE, REGIONS, CRITERIA, CRITERION, BANDS, miles, normalize, categoryWeights, admissions, affordability, evaluate, rank, explain, parseText, setting: SETTING, size: SIZE };
});
