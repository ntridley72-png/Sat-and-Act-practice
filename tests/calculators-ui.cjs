/* Calculator pages on the built site (public/): every tool renders with no page errors, shows the same result the
   tested library computes, updates as you type, supports undo and reset, keeps ads below the tool, fits a phone,
   hands results to college matching as a what-if without changing the saved profile, saves to the profile only on
   request, and pre-fills superscores from official scores the student already saved. */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");

const PUB = path.join(__dirname, "..", "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const IDS = fs.readdirSync(path.join(PUB, "calculators")).filter((d) => fs.existsSync(path.join(PUB, "calculators", d, "index.html")));

(async () => {
  assert.ok(IDS.length >= 13, "calculator pages: " + IDS.length);
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split("?")[0]); if (url.endsWith("/")) url += "index.html";
    fs.readFile(path.join(PUB, url), (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": TYPES[path.extname(url)] || "application/octet-stream" }); res.end(buf); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const big = () => page.locator(".calc-r.big b").first().textContent();

  // 1) Every tool renders; no ad slot sits between the heading and the tool.
  for (const id of IDS) {
    await page.goto(`${base}/calculators/${id}/`, { waitUntil: "load" });
    await page.waitForSelector(".calc .calc-result");
    const order = await page.evaluate(() => {
      const calc = document.querySelector(".calc"), h1 = document.querySelector("h1");
      const slots = [...document.querySelectorAll("[data-ad-slot]")].filter((s) => s.closest(".gwrap"));
      const between = slots.filter((s) => h1.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING && s.compareDocumentPosition(calc) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { between: between.length, inside: calc.querySelectorAll("[data-ad-slot]").length };
    });
    assert.equal(order.between, 0, id + ": an ad slot sits between the heading and the calculator");
    assert.equal(order.inside, 0, id + ": an ad slot inside the calculator");
    assert.notEqual((await big()).trim(), "—", id + ": the example data gives a result");
  }

  // 2) Results agree with the library on the example data.
  const lib = async (expr) => page.evaluate(expr);
  await page.goto(`${base}/calculators/weighted-gpa/`, { waitUntil: "load" }); await page.waitForSelector(".calc-result");
  const expectW = await lib(() => FunSATCalc.round2(FunSATCalc.gpa([{ grade: "B+", type: "ap" }, { grade: "A-", type: "honors" }, { grade: "B" }, { grade: "A" }, { grade: "A", type: "de" }]).weighted).toFixed(2));
  assert.equal((await big()).trim(), expectW, "weighted GPA matches the library");

  // 3) Typing updates; undo and reset work; focus stays in the field.
  await page.goto(`${base}/calculators/final-grade/`, { waitUntil: "load" }); await page.waitForSelector(".calc-result");
  assert.equal((await big()).trim(), "96.0%", "(88 - 86 x 0.8) / 0.2 = 96");
  const target = page.locator('[data-k="target"]');
  await target.fill("95");
  assert.equal((await big()).trim(), "Not possible", "an impossible target says so");
  assert.ok(await page.locator(".calc-note").first().textContent().then((t) => /best you can finish with is 88\.8%/.test(t)), "and gives the best reachable grade");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.k), "target", "focus stays in the field while typing");
  await page.click('[data-act="undo"]');
  assert.equal(await target.inputValue(), "88", "undo restores the previous value");
  await target.fill("70"); await page.click('[data-act="reset"]');
  assert.equal(await page.locator('[data-k="target"]').inputValue(), "88", "reset restores the example");

  // 4) Weighted categories: blank categories are left out; weights that do not add to 100 are flagged.
  await page.goto(`${base}/calculators/weighted-grade/`, { waitUntil: "load" }); await page.waitForSelector(".calc-result");
  assert.match(await page.locator(".calc-result").textContent(), /Weight graded so far\s*80\.0%/);
  await page.locator('[data-k="cats.0.weight"]').fill("30");
  assert.match(await page.locator(".calc-note").first().textContent(), /add up to 110\.0%/);

  // 5) What-if to college matching keeps the saved profile; saving is explicit.
  // Seed from a calculator page: the app itself re-saves its in-memory profile when you leave it.
  await page.goto(`${base}/calculators/`, { waitUntil: "load" });
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("satPrepProfile_v1") || "{}"); p.college = Object.assign(p.college || {}, { gpa: 2.9, gpaScale: "4uw", sat: 1350, testType: "sat" }); localStorage.setItem("satPrepProfile_v1", JSON.stringify(p)); });
  await page.goto(`${base}/calculators/gpa-improvement/`, { waitUntil: "load" }); await page.waitForSelector(".calc-next a.primary");
  const href = await page.locator(".calc-next a.primary").getAttribute("href");
  assert.match(href, /open=college/); assert.match(href, /gpa=3\.2/); assert.match(href, /hyp=1/);
  await page.click(".calc-next a.primary");
  await page.waitForSelector(".college-whatif", { timeout: 15000 });
  assert.match(await page.locator(".college-whatif").textContent(), /GPA 3\.20 \(saved: 2\.90\)/);
  const savedGpa = await page.evaluate(() => JSON.parse(localStorage.getItem("satPrepProfile_v1")).college.gpa);
  assert.equal(savedGpa, 2.9, "the what-if did not overwrite the saved GPA");
  assert.ok(!/gpa=/.test(page.url()), "the numbers are removed from the address bar");
  await page.click('[data-whatif="restore"]');
  assert.equal(await page.locator(".college-whatif").count(), 0, "restore clears the what-if");
  await page.goto(`${base}/calculators/high-school-gpa/`, { waitUntil: "load" }); await page.waitForSelector(".calc-next");
  await page.click('[data-act="profile-gpa"]');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("satPrepProfile_v1")).college);
  const expectHs = await lib(() => FunSATCalc.round2(FunSATCalc.termsGpa([{ courses: [{ grade: "A-" }, { grade: "B+" }, { grade: "A" }, { grade: "B" }] }, { courses: [{ grade: "B" }, { grade: "B+" }, { grade: "A-" }, { grade: "A" }] }]).cumulative.unweighted));
  assert.equal(after.gpa, expectHs, "saving writes the unweighted cumulative GPA"); assert.equal(after.gpaScale, "4uw"); assert.equal(after.sat, 1350, "other fields untouched");

  // 6) Superscore pre-fills from official scores saved on the Plan page.
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("satPrepProfile_v1")); p.scoreReports = [{ kind: "sat", date: "2026-03-14", total: 1300, sections: { rw: 640, math: 660 } }, { kind: "sat", date: "2026-05-02", total: 1330, sections: { rw: 690, math: 640 } }]; localStorage.setItem("satPrepProfile_v1", JSON.stringify(p)); localStorage.removeItem("funsatCalc_v1"); });
  await page.goto(`${base}/calculators/sat-superscore/`, { waitUntil: "load" }); await page.waitForSelector(".calc-result");
  assert.match(await page.locator(".calc-prefill").textContent(), /Plan page/);
  assert.equal((await big()).trim(), "1350", "690 + 660");

  // 7) "Remember" keeps entries in this browser only; unticking deletes them.
  await page.goto(`${base}/calculators/grade/`, { waitUntil: "load" }); await page.waitForSelector(".calc-result");
  await page.check('[data-act="remember"]'); await page.locator('[data-k="items.0.earned"]').fill("20");
  assert.ok(await page.evaluate(() => !!JSON.parse(localStorage.getItem("funsatCalc_v1")).grade));
  await page.uncheck('[data-act="remember"]');
  assert.ok(await page.evaluate(() => !JSON.parse(localStorage.getItem("funsatCalc_v1")).grade), "unticking removes saved entries");

  // 8) Hub search and filters; phone layout.
  await page.goto(`${base}/calculators/`, { waitUntil: "load" });
  await page.fill("#chubQ", "final exam");
  assert.equal(await page.locator(".chub-list li:not([hidden])").count(), 1);
  await page.fill("#chubQ", ""); await page.click('[data-filter="tests"]');
  assert.ok(await page.locator('.chub-group[data-cat="gpa"]').isHidden());
  assert.match(await page.locator("#chubRecent").textContent(), /Recently used/);
  await page.setViewportSize({ width: 360, height: 760 });
  for (const id of ["high-school-gpa", "weighted-grade", "gpa-improvement", "act-superscore"]) {
    await page.goto(`${base}/calculators/${id}/`, { waitUntil: "load" }); await page.waitForSelector(".calc-result");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 1, id + " scrolls sideways on a phone by " + over + "px (tables scroll inside their own box)");
  }
  assert.deepEqual(errors, []);
  await browser.close(); server.close();
  console.log("PASS: " + IDS.length + " calculators render, match the library, update/undo/reset, keep ads below the tool, fit phones; what-if and profile hand-off and pre-fill work.");
})().catch((e) => { console.error(e); process.exit(1); });
