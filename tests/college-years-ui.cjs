/* The college profile's "Admissions by year" card: it loads the IPEDS years only when a profile opens, each button shows
   exactly one year (numbers match college-years.js), and the static page has the same years in a crawlable table. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
// SERVE_PUBLIC=1 runs the same checks against the built site (public/), which ships the slimmed college-data.js.
const SERVE = process.env.SERVE_PUBLIC ? path.join(ROOT, "public") : ROOT;
const SHELL = process.env.SERVE_PUBLIC ? "index.html" : "SAT & ACT Practice.html";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
const years = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/data/college-years.json"), "utf8"));
const HARVARD = 166027;

(async () => {
  const requested = [];
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    requested.push(url);
    const file = path.join(SERVE, url === "/" ? SHELL : url.slice(1));
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  assert.ok(!requested.includes("/college-years.js"), "year data is not part of the first page load");

  await page.click("#btnCollege");
  await page.waitForSelector("#screen-college", { state: "visible" });
  await page.click("#ccAdd");
  await page.fill("#collegeQuery", "Harvard");
  await page.locator(".college-row", { hasText: "Harvard University" }).locator(".college-row-main").first().click();
  await page.waitForSelector("#collegeDetail .cf-years");
  await page.waitForSelector('#collegeDetail [data-cyear="2021"]');
  assert.ok(requested.includes("/college-years.js"), "year data loads when a profile opens");

  const card = page.locator("#collegeDetail .cf-years");
  const labels = await card.locator("[data-cyear]").allTextContents();
  assert.deepEqual(labels, ["Latest", "Fall 2023", "Fall 2022", "Fall 2021"]);
  assert.match(await card.textContent(), /Fall 2024/, "latest column names its corrected period");

  for (const key of ["2023", "2022", "2021"]) {
    await card.locator(`[data-cyear="${key}"]`).click();
    const y = years.colleges[HARVARD][key];
    const text = await card.textContent();
    assert.ok(text.includes(y.adm + "%"), key + " admit rate " + y.adm);
    assert.ok(text.includes(y.sr25 + "–" + y.sr75), key + " SAT range");
    assert.ok(text.includes("$" + y.ti.toLocaleString("en-US")), key + " tuition");
    assert.equal(await card.locator('[aria-pressed="true"]').count(), 1);
    assert.equal(await card.locator('[aria-pressed="true"]').getAttribute("data-cyear"), key);
    for (const other of ["2023", "2022", "2021"].filter((k) => k !== key)) {
      const o = years.colleges[HARVARD][other];
      if (o.ti !== y.ti) assert.ok(!text.includes("$" + o.ti.toLocaleString("en-US")), "no " + other + " tuition mixed into " + key);
    }
  }
  const gallery = await page.evaluate(() => [...document.querySelectorAll("#collegeDetail .college-photo")].map((f) => ({
    src: f.querySelector("img").getAttribute("src"), credit: f.querySelector("figcaption").textContent, href: (f.querySelector("figcaption a") || {}).href || "" })));
  assert.ok(gallery.length >= 1, "Harvard gallery renders");
  for (const g of gallery) {
    assert.match(g.src, /^https:\/\/(upload|thumb)\.wikimedia\.org\//);
    assert.match(g.credit, / · /, "credit shows author and license: " + g.credit);
    assert.match(g.href, /commons\.wikimedia\.org\/wiki\//);
  }
  await card.locator('[data-cyear="latest"]').click();
  assert.ok((await card.textContent()).includes("3.6%"));
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, "no sideways scroll on a phone: " + overflow);

  const staticPage = path.join(ROOT, "public/colleges/harvard-university/index.html");
  if (fs.existsSync(staticPage)) {
    const html = fs.readFileSync(staticPage, "utf8");
    assert.match(html, /id="by-year"/);
    assert.ok(html.includes("Fall 2021") && html.includes("56,937"), "static page has every year in plain HTML");
  }
  assert.deepEqual(errors, []);
  await browser.close();
  server.close();
  console.log("PASS: college years load on demand, one year at a time, numbers match IPEDS, static table present.");
})().catch((e) => { console.error(e); process.exit(1); });
