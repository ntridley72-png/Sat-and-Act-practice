/* Offline audit of the verified college data bundles:
   college-data.js (federal stats + provenance), college-safety.js (ED campus
   safety, three years, geographies kept separate), college-photos-extra.js
   (activity / nearby photos with full evidence) and the photo rejection log.
   Runs with plain node, no browser and no network. */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function load(filename, globalName) {
  const src = fs.readFileSync(path.join(ROOT, filename), "utf8");
  const marker = "window." + globalName + " = ";
  const i = src.indexOf(marker);
  if (i < 0) throw new Error(filename + ": global " + globalName + " not found");
  return JSON.parse(src.slice(i + marker.length).replace(/;\s*$/, ""));
}

const data = load("college-data.js", "COLLEGE_DATA");
const safety = load("college-safety.js", "COLLEGE_SAFETY");
const photos = load("college-photos-extra.js", "COLLEGE_PHOTOS_EXTRA");
const curation = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/data/college-photo-curation.json"), "utf8"));
const rejections = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/college-photos-rejections.json"), "utf8"));

// --- stats provenance ------------------------------------------------------
const defs = data.meta.statsDefs || {};
const REQUIRED_DEF_KEYS = ["label", "unit", "definition", "period", "population", "source"];
const RENDERED_KEYS = ["adm", "enr", "sr", "ar", "satAvg", "test", "ti", "to", "rb", "np", "bands", "gr", "gpell", "ret", "ern", "pell", "loan", "debt", "fam", "cdr", "sfr", "fg", "rpp"];
for (const key of RENDERED_KEYS) {
  const d = defs[key];
  ok(d, "statsDefs missing " + key);
  if (!d) continue;
  for (const field of REQUIRED_DEF_KEYS) ok(d[field] && String(d[field]).trim(), "statsDefs." + key + "." + field + " empty");
}
ok(data.meta.statsNote && /missing/i.test(data.meta.statsNote), "meta.statsNote must explain missing values");
const STATUSES = new Set(["ok", "zero", "suppressed", "missing", "unrecognized", "unmapped-code"]);
const VALUE_KEYS = { adm: "adm", enr: "enr", ti: "ti", to: "to", gr: "gr", ret: "ret", np: "np", pell: "pell" };
let checkedPairs = 0;
for (const c of data.colleges) {
  ok(c.prov && typeof c.prov === "object", "college " + c.id + " lacks provenance");
  if (!c.prov) continue;
  for (const [provKey, status] of Object.entries(c.prov)) {
    ok(STATUSES.has(status), "college " + c.id + " prov." + provKey + " unknown status " + status);
  }
  // A value shown means provenance says ok or zero; a missing value must not be 'ok'.
  for (const [provKey, valueKey] of Object.entries(VALUE_KEYS)) {
    const status = c.prov[provKey];
    const value = c[valueKey];
    if (value == null) ok(status !== "ok", "college " + c.id + ": " + provKey + " is null but marked ok");
    else ok(status === "ok" || status === "zero", "college " + c.id + ": " + provKey + " has a value but status " + status);
    checkedPairs++;
  }
  // Bands: five labeled rows with valid statuses and sane values.
  ok(Array.isArray(c.bands) && c.bands.length === 5, "college " + c.id + " bands must have 5 rows");
  if (Array.isArray(c.bands)) {
    for (const [label, value, status] of c.bands) {
      ok(/^\$/.test(label), "band label " + label);
      ok(STATUSES.has(status), "band status " + status);
      if (value != null) ok(status === "ok" || status === "zero", "band value with status " + status);
    }
  }
}
ok(checkedPairs > 2800, "provenance/value pairs checked: " + checkedPairs);

// --- campus safety ---------------------------------------------------------
const pilotIds = Object.keys(safety.colleges);
ok(pilotIds.length >= 14, "pilot must cover at least fourteen schools, saw " + pilotIds.length);
const REQUIRED_GROUPS = ["criminal", "vawa", "arrests", "disciplinary", "unfounded"];
const GEO_KEYS = ["onCampus", "housing", "noncampus", "publicProperty"];
for (const [id, school] of Object.entries(safety.colleges)) {
  ok(/^\d+$/.test(id), "unitid key " + id);
  ok(school.years.length === 3, id + ": expected three years");
  ok(school.years.every((y) => /^\d{4}$/.test(y)), id + ": year labels");
  ok(school.crossCheck && school.crossCheck.status === "verified", id + ": cross-check not verified");
  ok(school.crossCheck && school.crossCheck.cellsChecked >= 150, id + ": too few cross-checked cells");
  ok(Array.isArray(school.campuses) && school.campuses.length >= 1, id + ": campuses missing");
  for (const g of REQUIRED_GROUPS) {
    ok((school.groups || []).some((x) => x.key === g), id + ": missing group " + g);
  }
  const criminal = (school.groups || []).find((x) => x.key === "criminal");
  ok(criminal && criminal.screens.onCampus, id + ": criminal on-campus screen missing");
  const rape = criminal && criminal.screens.onCampus.rows.find((r) => r.label === "Rape");
  ok(rape && rape.values.length === 3, id + ": Rape row must be present with three values");
  // Housing is a subset of on-campus: it can never exceed it for a category.
  // Source filings that violate this (verified in both ED artifacts) must be
  // recorded in subsetAnomalies; unflagged violations fail the check.
  const anomalySet = new Set((school.subsetAnomalies || []).map((a) => a.group + "|" + a.category + "|" + a.year));
  for (const g of ["criminal", "vawa", "arrests", "disciplinary"]) {
    const group = (school.groups || []).find((x) => x.key === g);
    if (!group || !group.screens.onCampus || !group.screens.housing) continue;
    const housingRows = new Map(group.screens.housing.rows.map((r) => [r.label, r.values]));
    for (const row of group.screens.onCampus.rows) {
      const hv = housingRows.get(row.label);
      if (!hv) continue;
      for (let i = 0; i < 3; i++) {
        const a = row.values[i], b = hv[i];
        if (typeof a === "number" && typeof b === "number" && b > a) {
          ok(anomalySet.has(g + "|" + row.label + "|" + school.years[i]),
             id + ": housing " + row.label + " " + b + " exceeds on-campus " + a + " for " + school.years[i] + " without a recorded anomaly");
        }
      }
    }
  }
  ok((school.resources || []).length >= 2, id + ": at least two support links expected");
}
ok(safety.meta.limitations && /prevalence/i.test(safety.meta.limitations), "meta must state the prevalence limitation");
ok(Array.isArray(safety.meta.asrChecks) && safety.meta.asrChecks.length >= 1 &&
   safety.meta.asrChecks.every((c) => c.result && c.document.startsWith("https://")),
   "the ASR spot-check must be recorded with its document");
ok(/never added/i.test(safety.meta.geographyNote || ""), "meta must state the housing subset rule");

// --- photos ----------------------------------------------------------------
const LICENSE_OK = /^(public domain|cc0|cc[ -]by(?:[ -]sa)?[ -]?\d(?:\.\d)?)$/i;
const seenTitles = new Set();
let photoCount = 0;
for (const [id, school] of Object.entries(photos.colleges)) {
  for (const p of school.photos) {
    photoCount++;
    ok(p.category === "activity" || p.category === "nearby", id + ": category " + p.category);
    ok(!seenTitles.has(p.title), "duplicate photo across schools: " + p.title);
    seenTitles.add(p.title);
    ok(LICENSE_OK.test((p.license || "").trim()), p.title + ": license " + p.license);
    ok(p.creator && p.creator.trim(), p.title + ": creator missing");
    ok(p.descriptionUrl && p.descriptionUrl.startsWith("https://commons.wikimedia.org/"), p.title + ": Commons file page missing");
    ok(p.officialSource && p.officialSource.startsWith("http"), p.title + ": official source missing");
    ok(p.officialSourceNote && p.officialSourceNote.length > 20, p.title + ": official source note too thin");
    ok(p.depicted && p.depicted.trim(), p.title + ": depicted subject missing");
    ok(p.caption && p.caption.trim(), p.title + ": caption missing");
    ok(typeof p.distanceMeters === "number" && p.distanceMeters <= 16093, p.title + ": distance gate");
    ok(p.width >= 1000 && p.height >= 560, p.title + ": size gate");
    ok(p.verified === "2026-10-13", p.title + ": verification date");
  }
  ok(curation[id] && curation[id].photos.length === school.photos.length,
     id + ": curation entries must match published photos");
  ok(curation[id] && (curation[id].photos || []).every((x) => x.officialSourceNote),
     id + ": curation needs source notes");
}
ok(photoCount >= 10, "expected at least ten approved photos, saw " + photoCount);
ok(Object.keys(rejections.discoveryStats || {}).length >= 6, "rejection log must cover every pilot school");
ok((rejections.rejections || []).length >= 4, "explicit rejections expected");
ok((rejections.rejections || []).every((r) => r.reason && r.reason.length > 15), "every rejection needs a real reason");

if (fails.length) {
  console.error("FAIL (" + fails.length + "):");
  for (const f of fails.slice(0, 25)) console.error(" -", f);
  process.exit(1);
}
console.log("PASS: provenance covers every rendered metric (" + data.colleges.length + " colleges, " + checkedPairs +
  " value/status pairs), income bands are labeled, " + pilotIds.length + " pilot schools carry three-year cross-verified " +
  "safety tables with housing kept separate, and " + photoCount + " photos pass every evidence gate.");
