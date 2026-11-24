/* Zoom on the test screen: the toolbar control and Ctrl/Cmd + - 0 change the text size on top of fit-to-screen, from 80% to
   200%, are remembered, and above 100% the question scrolls instead of being shrunk back. There is no layout picker; the
   test screen always uses the standard Exam layout. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = BASE + "/" + encodeURIComponent("SAT & ACT Practice.html") + "?nosw";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.fulfill({ status: 204, body: "" }));
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATPlanScreen);
  assert.equal(await page.getAttribute("body", "data-workspace"), "exam");
  assert.equal(await page.locator("#workspaceTheme").count(), 0, "no layout picker");
  await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "rw"; state.cfg.total = 6; document.getElementById("btnStart").click(); });
  await require("./helpers/to-choice.cjs")(page);
  await page.waitForTimeout(400);
  const fit = () => page.evaluate(() => parseFloat(document.querySelector("#screen-test .workspace-question-body").style.getPropertyValue("--fit") || "1"));
  const base = await fit();
  assert.equal((await page.textContent("#bbZoomVal")).trim(), "100%");
  await page.click("#bbZoomIn"); await page.click("#bbZoomIn");
  assert.equal((await page.textContent("#bbZoomVal")).trim(), "125%");
  assert.ok(Math.abs((await fit()) - base * 1.25) < 0.02, "zoom multiplies the fitted size: " + base + " -> " + (await fit()));
  assert.ok(await page.evaluate(() => document.body.classList.contains("bb-zoomed")), "zoomed in: the question may scroll");
  await page.keyboard.press("Control+Equal");
  assert.equal((await page.textContent("#bbZoomVal")).trim(), "150%", "Ctrl + zooms in");
  await page.keyboard.press("Control+Minus");
  assert.equal((await page.textContent("#bbZoomVal")).trim(), "125%", "Ctrl - zooms out");
  for (let i = 0; i < 10 && !(await page.locator("#bbZoomIn").isDisabled()); i++) await page.click("#bbZoomIn");
  assert.equal((await page.textContent("#bbZoomVal")).trim(), "200%"); assert.ok(await page.locator("#bbZoomIn").isDisabled(), "200% is the limit");
  // Remembered across a reload and on the next question.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSATPlanScreen);
  await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "rw"; state.cfg.total = 6; document.getElementById("btnStart").click(); });
  await require("./helpers/to-choice.cjs")(page);
  await page.waitForTimeout(300);
  assert.equal((await page.textContent("#bbZoomVal")).trim(), "200%", "zoom is remembered");
  await page.keyboard.press("Control+0");
  assert.equal((await page.textContent("#bbZoomVal")).trim(), "100%", "Ctrl 0 resets");
  assert.ok(!(await page.evaluate(() => document.body.classList.contains("bb-zoomed"))));
  for (let i = 0; i < 6 && !(await page.locator("#bbZoomOut").isDisabled()); i++) await page.click("#bbZoomOut");
  assert.equal((await page.textContent("#bbZoomVal")).trim(), "80%"); assert.ok(await page.locator("#bbZoomOut").isDisabled(), "80% is the limit");
  await page.click("#bbZoomVal");
  assert.deepEqual(errs, []);
  await browser.close();
  console.log("PASS: test-screen zoom (toolbar and Ctrl/Cmd + - 0) works on top of fit-to-screen, 80-200%, is remembered; the Exam layout is the only layout.");
})().catch((e) => { console.error(e); process.exit(1); });
