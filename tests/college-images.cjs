/* College image data validator.
   Every emitted image in college-data.js must carry a photographer credit, a
   readable license, a Commons source page and a category label; nothing may be
   a logo/seal/placeholder; no college may carry more than six photos; the A–D
   social grade field must be gone. Prints per-category coverage for the report. */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.dirname(__dirname);
const LABELS = {
  athletics: "Stadium & athletics",
  greek: "Greek life",
  architecture: "Campus architecture",
  surroundings: "Campus surroundings",
  campus: "Campus life",
  social: "Student life & traditions",
  history: "School history",
};
const BAD = /logo|seal|crest|coat_of_arms|coat%20of%20arms|wordmark|bookplate|contact.?sheet|placeholder/i;
const SOURCE = /^https:\/\/commons\.wikimedia\.org\/wiki\//;

/* A prospective student wants to see the place, not a scrum of players, and a
   road game is shot at the opponent's stadium — which is how another school's
   venue used to end up on a college's own page. */
const ACTION = /\bvs\.?\b|versus|championship|march madness|bowl game|pre-?game|halftime|kickoff|touchdown|scrimmage|tailgate|take[sn]? the field|entering field|head coach|offensive coordinator|defensive coordinator|quarterback|cheerlead|marching band|first pitch|playing of the|tip-?off|free throw|home run|student section/i;
const VENUE = /stadium|arena|ballpark|coliseum|field ?house|natatorium|pavilion|athletics? complex|sports complex|track|field/i;

/* The Commons file name, decoded and readable: "Kyle Field aerial.jpg". */
const fileName = (im) => {
  const raw = String(im.l || im.u || "");
  const tail = raw.includes("/wiki/") ? raw.split("/wiki/").pop() : raw.split("/").pop();
  let name = tail;
  try { name = decodeURIComponent(tail); } catch (e) { /* a malformed escape keeps the raw tail */ }
  return name.replace(/^File:?/i, "").replace(/_/g, " ");
};

const fails = [];
const fail = (msg) => fails.push(msg);

const src = fs.readFileSync(path.join(ROOT, "college-data.js"), "utf8");
const match = src.match(/window\.COLLEGE_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
if (!match) { console.error("FAIL college-data.js does not match the expected shape"); process.exit(1); }
const data = JSON.parse(match[1]);
const colleges = data.colleges || [];

if (colleges.length < 300) fail("expected the full selection of colleges, saw " + colleges.length);

const coverage = {};
Object.keys(LABELS).forEach((kind) => { coverage[LABELS[kind]] = 0; });
let withImages = 0, sixImage = 0, total = 0;

for (const c of colleges) {
  if ("sg" in c) { fail(c.n + ": social grade field still in the bundle"); }
  const imgs = c.imgs || [];
  if (imgs.length > 6) fail(c.n + ": more than six photos (" + imgs.length + ")");
  if (imgs.length === 6) sixImage++;
  if (imgs.length) withImages++;
  const seen = new Set();
  for (const im of imgs) {
    total++;
    const where = c.n + " / " + (im.l || im.u || "?");
    if (!im.u || !im.src || im.u !== im.src) fail(where + ": src/u must be the same display URL");
    if (!im.credit || !String(im.credit).trim()) fail(where + ": missing photographer credit");
    if (!im.license || !String(im.license).trim()) fail(where + ": missing license");
    if (im.license && im.credit && im.license === im.credit && im.license !== "Wikimedia Commons") {
      fail(where + ": license may not be a copy of the credit");
    }
    if (!SOURCE.test(im.l || "")) fail(where + ": source must be a Commons file page, saw " + (im.l || "(empty)"));
    if (!LABELS[im.kind]) fail(where + ": unknown category kind " + JSON.stringify(im.kind));
    if (im.label !== LABELS[im.kind]) fail(where + ": label must match its kind, saw " + JSON.stringify(im.label));
    if (BAD.test(im.l || "") || BAD.test(im.u || "")) fail(where + ": rejected subject (logo/seal/placeholder)");
    const name = fileName(im);
    if (ACTION.test(name)) fail(where + ": game action / people close-up, not a view of the school");
    if (im.kind === "athletics" && !VENUE.test(name)) {
      fail(where + ": filed as athletics but the file name names no venue");
    }
    if (seen.has(im.u)) fail(where + ": duplicate photo inside the college");
    seen.add(im.u);
    if (LABELS[im.kind]) coverage[im.label]++;
  }
}

// ---- verified official campus-life links
const LINK_CATS = ["clubs", "greek", "athletics", "events", "housing", "paper"];
const linkCoverage = {};
LINK_CATS.forEach((k) => { linkCoverage[k] = 0; });
let linksColleges = 0;
for (const c of colleges) {
  const links = c.links;
  if (!links) continue;
  linksColleges++;
  let host = "";
  try { host = new URL(/^https?:/.test(c.url) ? c.url : "https://" + c.url).hostname.replace(/^www\./, ""); } catch (e) {}
  const reg = host.split(".").slice(-2).join(".");
  for (const cat of LINK_CATS) {
    const url = links[cat];
    if (!url) continue;
    linkCoverage[cat]++;
    let lh = "";
    try { lh = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
    if (!/^https:\/\//.test(url)) fail(c.n + ": link " + cat + " must be https, saw " + url);
    if (!(lh === host || lh.endsWith("." + reg) || lh === reg || (host && lh.endsWith("." + host)))) {
      fail(c.n + ": link " + cat + " leaves the official domain: " + url);
    }
  }
}
console.log("official links: %d colleges carry verified links", linksColleges);
console.log("link coverage:", JSON.stringify(linkCoverage));
if (linksColleges === 0) fail("no college carries verified links; run scripts/enrich-college-links.py");

const zero = colleges.filter((c) => !(c.imgs || []).length);
console.log("college images: %d colleges | %d with photos | %d with six | %d photos total",
  colleges.length, withImages, sixImage, total);
console.log("per-category coverage:", JSON.stringify(coverage));
if (zero.length) console.log("zero-image colleges (%d): %s", zero.length, zero.slice(0, 12).map((c) => c.n).join("; ") + (zero.length > 12 ? " …" : ""));

fails.slice(0, 25).forEach((f) => console.log("FAIL " + f));
if (fails.length > 25) console.log("… and " + (fails.length - 25) + " more failures");
console.log(fails.length ? "\nRESULT: " + fails.length + " failure(s)" : "PASS: every college photo carries credit, license, Commons source and a matching category label.");
process.exit(fails.length ? 1 : 0);
