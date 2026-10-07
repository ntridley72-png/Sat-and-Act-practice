/* Technical SEO validation for the generated site in public/.
   Fails on: staging URLs in sitemaps, missing files, duplicate/missing canonicals,
   noindex in sitemaps, duplicate titles/descriptions, multiple H1s, malformed
   JSON-LD, broken internal links, orphan pages, missing game launch deep links,
   and a broken IndexNow dry run. Run: node tests/seo-audit.test.cjs */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const ORIGIN = "https://funsat.bid";
const fails = [];
const warns = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(PUBLIC);
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const fileForUrl = (url) => {
  const rel = url.replace(ORIGIN, "").replace(/^\//, "");
  const p = path.join(PUBLIC, rel);
  return fs.existsSync(path.join(p, "index.html")) ? path.join(p, "index.html") : (fs.existsSync(p) ? p : null);
};

// ---------- robots + sitemap index ----------
const robots = fs.readFileSync(path.join(PUBLIC, "robots.txt"), "utf8");
if (!/^User-agent: \*/m.test(robots) || !/^Allow: \//m.test(robots)) fail("robots.txt must allow all agents");
if (!/Sitemap: https:\/\/funsat\.bid\/sitemap\.xml/.test(robots)) fail("robots.txt must reference the stable sitemap URL");
const indexXml = fs.readFileSync(path.join(PUBLIC, "sitemap.xml"), "utf8");
if (!indexXml.includes("<sitemapindex")) fail("sitemap.xml must be a sitemap index");
const children = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (children.length < 5) fail("sitemap index should reference the content segments");
const sitemapUrls = [];
for (const child of children) {
  if (!child.startsWith(ORIGIN + "/sitemaps/")) { fail("sitemap index child must be a production sitemap: " + child); continue; }
  const f = path.join(PUBLIC, child.replace(ORIGIN, ""));
  if (!fs.existsSync(f)) { fail("missing sitemap child file: " + child); continue; }
  const xml = fs.readFileSync(f, "utf8");
  if (!xml.includes("<urlset")) fail("sitemap child is not a urlset: " + child);
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.push(m[1]);
}
const uniqueUrls = new Set(sitemapUrls);
// Reverse direction: every indexable generated HTML document must appear in exactly one sitemap.
const inSitemap = new Map();
sitemapUrls.forEach((u) => inSitemap.set(u, (inSitemap.get(u) || 0) + 1));
for (const [u, n] of inSitemap) if (n !== 1) fail(`URL appears ${n} times across sitemaps: ${u}`);
for (const f of htmlFiles) {
  const rel = path.relative(PUBLIC, path.dirname(f)).replace(/\\/g, "/");
  const url = rel === "" || rel === "." ? ORIGIN + "/" : `${ORIGIN}/${rel}/`;
  const html = fs.readFileSync(f, "utf8");
  if (/<meta name="robots" content="[^"]*noindex/i.test(html)) continue; // excluded on purpose
  if (!uniqueUrls.has(url)) fail(`indexable page missing from every sitemap: ${url}`);
}
const urlList = [...uniqueUrls];
if (uniqueUrls.size !== sitemapUrls.length) fail("a URL appears in more than one sitemap segment");

// ---------- every sitemap URL: production, present, canonical, indexable ----------
const titles = new Map(), descriptions = new Map(), canonicals = new Map();
const pageMeta = new Map();
for (const url of urlList) {
  if (!url.startsWith(ORIGIN + "/") || /localhost|127\.0\.0\.1|staging|preview|workers\.dev/.test(url)) { fail("non-production URL in sitemap: " + url); continue; }
  const f = fileForUrl(url);
  if (!f) { fail("sitemap URL has no generated file: " + url); continue; }
  const html = fs.readFileSync(f, "utf8");
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  const robotsMeta = (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || "";
  const h1s = [...html.matchAll(/<h1[\s>]/g)].length;
  if (!title) fail("missing title: " + url);
  if (!desc) fail("missing meta description: " + url);
  if (canon !== url) fail(`canonical mismatch on ${url}: ${canon}`);
  if (/noindex/i.test(robotsMeta)) fail("noindex page present in sitemap: " + url);
  if (h1s !== 1) fail(`expected exactly one H1 on ${url}, found ${h1s}`);
  if (/http-equiv="refresh"/i.test(html)) fail("meta refresh on " + url);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { fail("malformed JSON-LD on " + url); }
  }
  if (title) titles.set(title, (titles.get(title) || []).concat(url));
  if (desc) descriptions.set(desc, (descriptions.get(desc) || []).concat(url));
  if (canon) canonicals.set(canon, (canonicals.get(canon) || []).concat(url));
  pageMeta.set(url, { file: f, title, html });
}
for (const [t, urls] of titles) if (urls.length > 1) fail(`duplicate title (${urls.length}x): ${t} -> ${urls.slice(0, 3).join(", ")}`);
for (const [d, urls] of descriptions) if (urls.length > 1) warn(`duplicate description (${urls.length}x): ${d.slice(0, 60)}... -> ${urls.slice(0, 3).join(", ")}`);

// ---------- internal links: no broken targets, no orphans ----------
const linkedTo = new Set([ORIGIN + "/"]);
for (const [url, meta] of pageMeta) {
  for (const m of meta.html.matchAll(/href="([^"#]+)"/g)) {
    let href = m[1].split("?")[0].split("#")[0];
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    if (/\.(css|js|png|ico|xml|txt|svg|webp|jpg)$/.test(href)) {
      if (!fs.existsSync(path.join(PUBLIC, href.replace(/^\//, "")))) fail(`broken asset link ${href} on ${url}`);
      continue;
    }
    const target = ORIGIN + href;
    const key = href.endsWith("/") ? target : target + "/";
    linkedTo.add(key);
    if (!fileForUrl(target) && !fileForUrl(key)) fail(`broken internal link ${href} on ${url}`);
  }
}
for (const url of urlList) if (!linkedTo.has(url)) fail("orphan page (not linked from any generated page): " + url);

// ---------- games: launch deep links ----------
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const gameKeys = new Set([...appJs.matchAll(/\{\s*key:\s*"([^"]+)",\s*name:/g)].map((m) => m[1]));
const gamePages = urlList.filter((u) => u.includes("/unblocked-games/") && u !== ORIGIN + "/unblocked-games/");
if (gamePages.length < 20) fail("expected 20+ unblocked-game pages");
for (const url of gamePages) {
  const meta = pageMeta.get(url); if (!meta) continue;
  const launch = (meta.html.match(/href="\/\?play=([^"]+)"/) || [])[1];
  if (!launch) fail("game page missing /?play= launch link: " + url);
  else if (!gameKeys.has(launch)) fail(`game page launch key ${launch} not in GAME_LIST (${url})`);
}

// ---------- trust + hub pages exist ----------
for (const p of ["about", "methodology", "privacy", "contact", "corrections", "free-test-prep", "sat-practice", "act-practice", "score-calculators", "college-admissions", "college-comparisons", "colleges-by-state", "application-planning"]) {
  const f = path.join(PUBLIC, p, "index.html");
  if (!fs.existsSync(f)) fail("missing hub/trust page: /" + p + "/");
}

// ---------- IndexNow dry run: exits 0, transmits nothing ----------
try {
  const logPath = path.join(ROOT, "logs", "indexnow.log");
  const before = fs.existsSync(logPath) ? fs.statSync(logPath).mtimeMs : 0;
  const out = execFileSync("node", [path.join(ROOT, "scripts", "indexnow.mjs"), "--dry-run", "--since", "/tmp/indexnow-test-state.json"], { encoding: "utf8", timeout: 60000 });
  if (!/DRY RUN/.test(out)) fail("indexnow dry run did not report DRY RUN");
  if (fs.existsSync("/tmp/indexnow-test-state.json")) fail("indexnow dry run wrote submission state");
  const after = fs.existsSync(logPath) ? fs.statSync(logPath).mtimeMs : 0;
  if (after !== before) fail("indexnow dry run modified logs/indexnow.log (must be side-effect free)");
} catch (e) { fail("indexnow dry run failed: " + e.message); }

console.log(`SEO audit: ${uniqueUrls.size} sitemap urls, ${htmlFiles.length} html files, ${titles.size} unique titles`);
if (warns.length) { console.log("\nWARNINGS:"); warns.forEach((w) => console.log("  ⚠ " + w)); }
if (fails.length) { console.error("\nFAILURES:"); fails.forEach((f) => console.error("  ✗ " + f)); process.exit(1); }
console.log("PASS: robots, segmented sitemaps, canonicals, titles, H1s, JSON-LD, internal links, no orphans, game deep links, hubs, IndexNow dry run.");
