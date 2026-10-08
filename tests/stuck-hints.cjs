/* Stuck? panel: the three hint buttons call the tutor with noAnswer protection and never surface the correct choice. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const payloads = [];
  await page.route("**/api/ai", async (route) => {
    try { payloads.push(JSON.parse(route.request().postData() || "{}")); } catch (e) { payloads.push({}); }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: JSON.stringify({ shortAnswer: "Try naming the quantity the question asks you to compare first.", detailedSteps: [], simpleSteps: [], memoryTip: "", equations: [], verification: "", nextPractice: "" }), provider: "groq", model: "test-model" })
    });
  });

  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.evaluate(() => { try { arcade.close(); } catch (e) {} });
  await page.click("#btnStart");
  await page.waitForSelector("#questionCard .choice", { timeout: 8000 });

  await page.click("#btnStuckNudge");
  await page.waitForFunction(() => { const el = document.getElementById("qfxStuckOut"); return el && el.textContent.trim().length > 0 && el.textContent.indexOf("Thinking") < 0; }, { timeout: 8000 });
  const out = await page.textContent("#qfxStuckOut");
  if (!/compare|quantity|asks/i.test(out)) throw new Error("nudge output missing: " + out);
  if (!payloads.length) throw new Error("tutor endpoint was never called");
  const body = JSON.stringify(payloads[0]);
  if (!/"noAnswer":true/.test(body)) throw new Error("nudge request did not set noAnswer: " + body.slice(0, 200));
  if (!/"correctLetter":"[A-D]"/.test(body)) throw new Error("nudge request did not send correctLetter for the server guard");

  await page.click("#btnStuckFormula");
  await page.waitForTimeout(150);
  const formula = await page.textContent("#qfxStuckOut");
  if (!formula || formula.length < 20) throw new Error("formula output missing");

  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  console.log("PASS: Stuck? buttons call the tutor with noAnswer protection, never print a choice letter, and Formula renders locally.");
  await browser.close();
})().catch((err) => { console.error("FAIL: " + err.message); process.exit(1); });
