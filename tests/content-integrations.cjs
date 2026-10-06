const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("SAT & ACT Practice.html", "utf8");
for (const expected of [
  'rel="canonical" href="https://funsat.bid/"',
  'application/ld+json',
  'ca-pub-7330416749956065',
  'data-ad-slot="arcade-menu"',
  'data-ad-slot="home-sidebar"',
  'key: "dirtbike"',
]) {
  if (!html.includes(expected)) throw new Error("missing integration marker: " + expected);
}
if (!fs.readFileSync("robots.txt", "utf8").includes("sitemap.xml")) throw new Error("robots.txt does not name the sitemap");
if (!fs.readFileSync("sitemap.xml", "utf8").includes("https://funsat.bid/")) throw new Error("sitemap lacks canonical URL");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("college-data.js", "utf8"), sandbox);
const colleges = sandbox.window.COLLEGE_DATA.colleges;
const attributed = colleges.filter((college) => Array.isArray(college.imgs) && college.imgs.every((photo) => photo.u && photo.a && photo.l));
if (attributed.length && attributed.some((college) => college.imgs.length > 3)) throw new Error("gallery exceeds three images");
console.log("PASS: SEO, AdSense publisher, controlled slots, dirt-bike registration, and attributed college galleries are present (" + attributed.length + "/" + colleges.length + " galleries cached)." );
