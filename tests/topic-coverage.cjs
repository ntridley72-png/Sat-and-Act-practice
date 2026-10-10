/* Every Subject-practice topic (test|section|domain|skill) must offer at least 30 questions. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.waitForFunction(() => window.FunSATSubjects && window.FunSATSubjects.inventory);
  const inv = await page.evaluate(() => window.FunSATSubjects.inventory());
  const rows = Object.values(inv).map((t) => ({ key: t.key, count: t.ids.length })).sort((a, b) => a.count - b.count);
  const short = rows.filter((r) => r.count < 30);
  if (short.length) {
    throw new Error("topics below 30: " + JSON.stringify(short.slice(0, 10)));
  }
  if (errors.length) throw new Error(errors[0]);
  console.log("PASS: all " + rows.length + " subject-practice topics offer at least 30 questions (min " + rows[0].count + "; " + rows[0].key + ").");
  await browser.close();
})().catch((e) => { console.error("FAIL: " + e.message); process.exit(1); });
