/* SAT skill pages (built site): every skill page has worked examples whose answers sit in plain HTML, every drill link
   names a skill the app's picker really has, a drill link opens the Subjects picker on that skill without starting or
   replacing anything, and pages fit a phone. Run after the build (public/). */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");

const PUB = path.join(__dirname, "..", "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const pages = ["sat-math", "sat-reading-writing"].flatMap((hub) => fs.readdirSync(path.join(PUB, hub)).filter((d) => fs.existsSync(path.join(PUB, hub, d, "index.html"))).map((d) => `/${hub}/${d}/`));

(async () => {
  assert.ok(pages.length >= 28, "expected every official skill to have a page, found " + pages.length);
  const links = new Set();
  for (const p of pages) {
    const html = fs.readFileSync(path.join(PUB, p, "index.html"), "utf8");
    const samples = (html.match(/class="gq"/g) || []).length;
    assert.ok(samples >= 2, p + " has " + samples + " sample questions");
    assert.equal((html.match(/<details class="gq-ans">/g) || []).length, samples, p + ": every sample has its answer and explanation");
    assert.match(html, /not affiliated with the College Board/, p + " carries the non-affiliation note");
    assert.match(html, /"@type":"LearningResource"/);
    for (const m of html.matchAll(/href="(\/\?practice=[^"]+)"/g)) links.add(m[1].replace(/&amp;/g, "&"));
  }
  assert.ok(links.size >= 40, "drill links found: " + links.size);

  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]);
    if (url.endsWith("/")) url += "index.html";
    fs.readFile(path.join(PUB, url), (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(url)] || "application/octet-stream" }); res.end(buf);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Every drill link names an inventory key the app has.
  await page.goto(base + "/?nosw", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.FunSATSubjects && Object.keys(window.FunSATSubjects.inventory()).length > 20);
  const keys = await page.evaluate(() => Object.keys(window.FunSATSubjects.inventory()));
  for (const l of links) {
    const key = new URLSearchParams(l.slice(2)).get("practice");
    assert.ok(keys.includes(key), "drill link names a skill the app does not have: " + key);
  }

  // Following one opens the Subjects picker on that skill and starts nothing.
  await page.goto(base + "/sat-math/circles/", { waitUntil: "domcontentloaded" });
  await page.locator('a[href^="/?practice="]').first().click();
  await page.waitForSelector("[data-s-key]", { state: "visible" });
  const opened = await page.evaluate(() => ({ focused: (document.activeElement && document.activeElement.closest("[data-s-key]") || {}).dataset?.sKey, view: state.view, answers: Object.keys(state.answers).length }));
  assert.match(opened.focused || "", /\|Circles$/, "the Circles row is focused: " + JSON.stringify(opened));
  assert.equal(opened.answers, 0, "nothing was started");

  // Phone width: no sideways scroll, answers open.
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto(base + "/sat-reading-writing/boundaries/", { waitUntil: "domcontentloaded" });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 1, "sideways scroll on a phone: " + over);
  await page.locator("details.gq-ans summary").first().click();
  assert.ok(await page.locator("details.gq-ans").first().evaluate((d) => d.open));
  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log("PASS: " + pages.length + " skill pages with answered examples; " + links.size + " drill links all open real skills; phone layout fits.");
})().catch((e) => { console.error(e); process.exit(1); });
