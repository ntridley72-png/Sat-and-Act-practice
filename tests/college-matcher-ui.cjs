/* /college-match/ in a real browser (built site): questionnaire modes share answers, results show fit / admissions /
   cost / evidence separately, must-haves exclude with reasons, written preferences are only applied when confirmed,
   "why not" explains, saving writes the profile list, comparison and the list check work, the research panel shows
   cited official sources (endpoint mocked), nothing ad-related sits above the tool, and phones do not scroll sideways. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");

const PUB = path.join(__dirname, "..", "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

(async () => {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]); if (url.endsWith("/")) url += "index.html";
    fs.readFile(path.join(PUB, url), (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": TYPES[path.extname(url)] || "application/octet-stream" }); res.end(buf); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" }));
  let researchBody = null;
  await ctx.route("**/api/college-research", async (route) => {
    researchBody = JSON.parse(route.request().postData());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      answer: "Yes. The university lists a pre-pharmacy advising track [S1].", verified: true,
      sources: [{ url: "https://www.example.edu/pre-pharmacy", title: "Pre-pharmacy advising", retrieved: "2026-11-24", quote: "Students preparing for pharmacy school..." },
        { url: "javascript:alert(1)", title: "bad" }] }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Seed the FunSAT profile (scores the student already has).
  await page.goto(base + "/calculators/", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("satPrepProfile_v1", JSON.stringify({ college: { sat: 1250, gpa: 3.4, gpaScale: "4uw", saved: [] } })));

  await page.goto(base + "/college-match/", { waitUntil: "load" });
  await page.waitForSelector(".cmx-q");
  // No ad slot between the heading and the tool.
  assert.equal(await page.evaluate(() => { const h1 = document.querySelector("h1"), t = document.getElementById("cmx");
    return [...document.querySelectorAll("[data-ad-slot]")].filter((s) => h1.compareDocumentPosition(s) & 4 && s.compareDocumentPosition(t) & 4).length; }), 0);

  // Q1 majors: nursing, must have.
  await page.fill("[data-filter-majors]", "nurs");
  await page.locator('input[data-multi="majors"][value="nursing"]').check();
  await page.selectOption('[data-imp="major"]', "must");
  await page.click('[data-act="next"]');
  // Q2 test: pre-filled from the profile.
  assert.equal(await page.locator('[data-field="sat"]').inputValue(), "1250");
  await page.click('[data-act="next"]');
  // Q3 regions: Midwest.
  await page.locator('input[data-multi="regions"][value="midwest"]').check();
  // Switch depth: answers survive.
  await page.click('[data-mode="detailed"]');
  assert.ok(await page.locator('input[data-multi="regions"][value="midwest"]').isChecked(), "switching depth keeps answers");
  assert.match(await page.locator(".cmx-progress span").textContent(), /of (1[89]|2\d)/);
  await page.click('[data-mode="quick"]');
  await page.click('[data-act="next"]');   // home
  await page.click('[data-act="next"]');   // budget
  await page.fill('[data-field="budget"]', "20000");
  await page.selectOption('[data-field="income"]', "1");
  await page.click('[data-act="results"]');
  await page.waitForSelector(".cmx-card");

  // Four separate measures on every card.
  const first = page.locator(".cmx-card").first();
  for (const k of ["Personal fit", "Admissions", "Cost", "Evidence"]) assert.match(await first.textContent(), new RegExp(k));
  // Must-have: left-out colleges lack nursing, with the reason shown.
  await page.click('[data-section="excluded"]');
  assert.match(await page.locator(".cmx-card").first().textContent(), /Left out because:.*Nursing/);
  // Overall list: every college offers nursing according to the data.
  await page.click('[data-section="overall"]');
  const ids = await page.$$eval(".cmx-card", (els) => els.map((e) => Number(e.dataset.id)));
  const ok = await page.evaluate((ids) => ids.every((id) => window.COLLEGE_MATCH_DATA.colleges[id].cip.includes("51.38")), ids);
  assert.ok(ok, "main list only shows colleges with nursing degrees");

  // Weights: change one and the list recalculates without errors.
  await page.click(".cmx-weights summary");
  await page.locator('[data-weight="financial"]').fill("50");
  await page.waitForSelector(".cmx-card");

  // What-if score changes admissions only.
  const fitBefore = await page.locator(".cmx-card").first().locator("dd").first().textContent();
  await page.click(".cmx-scenario summary");
  await page.fill('[data-scn="sat"]', "1500");
  assert.equal(await page.locator(".cmx-card").first().locator("dd").first().textContent(), fitBefore, "a what-if score does not change fit");
  await page.click('[data-act="clear-scn"]');

  // Full breakdown and save.
  await page.locator("[data-details]").first().click();
  assert.match(await page.locator(".cmx-detail").first().textContent(), /Not verified|Meets|Doesn't meet/);
  const saveId = Number(await page.locator("[data-save]").first().getAttribute("data-save"));
  await page.locator("[data-save]").first().click();
  assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem("satPrepProfile_v1")).college.saved)).includes(saveId));

  // Compare two.
  await page.locator("[data-compare]").nth(0).click(); await page.locator("[data-compare]").nth(1).click();
  assert.match(await page.locator(".cmx-compare").textContent(), /Side by side/);

  // Research panel: question only, cited official sources, unsafe links dropped.
  await page.locator("[data-ask]").first().click();
  await page.fill(".cmx-research textarea", "Does it have pre-pharmacy advising?");
  await page.click(".cmx-research button.primary");
  await page.waitForSelector(".cmx-sources a");
  assert.deepEqual(Object.keys(researchBody).sort(), ["history", "id", "question"], "only the college and the question are sent");
  assert.equal(await page.locator(".cmx-sources a").count(), 1, "a non-https source link is dropped");

  // Why-not.
  await page.fill("[data-whynot]", "Harvard University");
  await page.locator("[data-whynot]").dispatchEvent("change");
  assert.match(await page.locator("[data-whynot-out]").textContent(), /Fails a requirement|#\d+/);

  // My list with the list check.
  await page.click('[data-section="list"]');
  await page.selectOption("[data-liststatus]", "Planning to apply");
  assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem("satPrepProfile_v1")).college.list[id].status, saveId), "Planning to apply");

  // Written preferences: proposals only until applied.
  await page.click('[data-act="edit"]');
  await page.click(".cmx-describe summary");
  await page.fill("[data-text]", "I want to study computer science in a big city, no car, near my family in Denver, and ski on weekends.");
  await page.click('[data-act="interpret"]');
  const text = await page.locator(".cmx-proposals").textContent();
  assert.match(text, /Computer science/); assert.match(text, /Denver, CO/); assert.match(text, /Near skiing/);
  assert.ok(!(await page.evaluate(() => JSON.parse(localStorage.getItem("funsatMatcher_v1")).A.majors.includes("cs"))), "not applied yet");
  await page.click('[data-act="apply-text"]');
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("funsatMatcher_v1")).A.majors.includes("cs")), "applied after confirming");

  // Clear my answers.
  await page.click('[data-act="clear-all"]');
  assert.equal(await page.evaluate(() => localStorage.getItem("funsatMatcher_v1")), null);

  // Phone.
  await page.setViewportSize({ width: 360, height: 760 });
  await page.reload({ waitUntil: "load" }); await page.waitForSelector(".cmx-q");
  await page.click('[data-act="results"]').catch(() => {});
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 1, "phone sideways scroll " + over);

  // Methodology page exists and names the scoring version.
  await page.goto(base + "/college-match/how-it-works/", { waitUntil: "load" });
  assert.match(await page.textContent("main, body"), /match-2026-11-24/);
  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log("PASS: matcher modes, separate measures, must-haves, weights, what-if, breakdown, save/list, compare, cited research, why-not, written preferences, clearing and phone layout.");
})().catch((e) => { console.error(e); process.exit(1); });
