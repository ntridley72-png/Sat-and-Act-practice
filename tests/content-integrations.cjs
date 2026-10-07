const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("SAT & ACT Practice.html", "utf8");
const appJs = fs.readFileSync("app.js", "utf8");
for (const expected of [
  'rel="canonical" href="https://funsat.bid/"',
  'name="google-site-verification" content="QoHkKWsV4WZOxC4SV3R6w-XlKf_X5HWzQuABaDQNgVI"',
  'application/ld+json',
  '"@type":"Organization"',
  '"@type":"FAQPage"',
  '"@type":"HowTo"',
  '<noscript>',
  'class="noscript-summary"',
  'id="how-it-works"',
  'defer src="app.js"',
  'provider:"adsterra"',
  'data-ad-slot="home-sidebar"',
  'data-ad-slot="rail-left"',
  'data-ad-slot="results-grid"',
]) {
  if (!html.includes(expected)) throw new Error("missing integration marker: " + expected);
}
const seoCommon = fs.readFileSync("scripts/seo_common.py", "utf8");
for (const expected of [
  'bauval.org/21/ba6d22b48d5d42c6cd1add3ad5e6c681',
  'container-ba6d22b48d5d42c6cd1add3ad5e6c681',
  'rail-left',
  '4e48d9998406ce142c41865c66a4325',
]) {
  if (!seoCommon.includes(expected)) throw new Error("generated-page ad config drifted: " + expected);
}
for (const expected of ['data-ad-slot="arcade-menu"', 'key: "dirtbike"']) {
  if (!(html + appJs).includes(expected)) throw new Error("missing app integration marker: " + expected);
}
const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
if (!jsonLd.length || !jsonLd.some((item) => Array.isArray(item["@graph"]))) throw new Error("structured data graph is missing or invalid");
if (/"sameAs"/.test(html)) throw new Error("sameAs must not be added without verified social profiles");
if (html.length > 120000) throw new Error("HTML shell should remain under 120 KB after app extraction; saw " + html.length);
if (appJs.length < 500000) throw new Error("deferred app bundle is missing or unexpectedly small");
if (!fs.readFileSync("robots.txt", "utf8").includes("sitemap.xml")) throw new Error("robots.txt does not name the sitemap");
if (!fs.readFileSync("sitemap.xml", "utf8").includes("https://funsat.bid/")) throw new Error("sitemap lacks canonical URL");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("college-data.js", "utf8"), sandbox);
const colleges = sandbox.window.COLLEGE_DATA.colleges;
const attributed = colleges.filter((college) => Array.isArray(college.imgs) && college.imgs.every((photo) => photo.u && photo.a && photo.l));
if (attributed.length && attributed.some((college) => college.imgs.length > 3)) throw new Error("gallery exceeds three images");
console.log("PASS: SEO, Adsterra units, controlled slots, dirt-bike registration, and attributed college galleries are present (" + attributed.length + "/" + colleges.length + " galleries cached)." );
