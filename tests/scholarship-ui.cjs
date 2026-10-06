/* Headless UI smoke test for the Scholarship Searcher: search, filters, saves, empty state. */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.dirname(__dirname);
const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";
const SHOTS = path.join(ROOT, "tests", "screenshots");

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push("console: " + msg.text()); });

  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");

  await page.click("#btnScholarships");
  await page.waitForSelector("#screen-scholarships", { state: "visible" });
  if (!(await page.isVisible("#screen-scholarships"))) throw new Error("scholarship screen did not open from the top tile");
  const total = await page.locator(".scholar-card").count();
  if (total < 45) throw new Error("expected at least 45 scholarships, saw " + total);

  await page.fill("#scholarQuery", "Gates");
  await page.waitForTimeout(150);
  const gates = await page.locator(".scholar-name", { hasText: "The Gates Scholarship" }).count();
  if (!gates) throw new Error("search did not find the Gates Scholarship");
  const countText = await page.textContent("#scholarCount");
  if (!/match your search/.test(countText)) throw new Error("result count did not update during search: " + countText);

  await page.fill("#scholarQuery", "");
  await page.waitForTimeout(150);
  await page.click('[data-scholar-tag="stem"]');
  await page.waitForTimeout(150);
  const stemCount = await page.locator(".scholar-card").count();
  if (stemCount < 3) throw new Error("STEM filter returned too few scholarships: " + stemCount);
  const stemTags = await page.locator(".scholar-card .scholar-tag", { hasText: "STEM" }).count();
  if (stemTags !== stemCount) throw new Error("a card under the STEM filter is missing its STEM tag");

  const firstName = (await page.textContent(".scholar-card .scholar-name")).trim();
  await page.click(".scholar-card [data-scholar-save]");
  await page.waitForTimeout(120);
  const savedState = await page.evaluate(() => ({
    saved: (profile.scholarships && profile.scholarships.saved) || [],
    label: document.querySelector(".scholar-card [data-scholar-save]").textContent,
  }));
  if (savedState.saved.length !== 1 || !/Saved/.test(savedState.label)) throw new Error("saving a scholarship did not persist");

  await page.click("[data-scholar-reset]");
  await page.waitForTimeout(150);
  await page.click("[data-scholar-saved]");
  await page.waitForTimeout(150);
  const savedCards = await page.locator(".scholar-card").count();
  if (savedCards !== 1) throw new Error("My list filter should show exactly 1 saved scholarship, saw " + savedCards);
  const savedName = (await page.textContent(".scholar-card .scholar-name")).trim();
  if (savedName !== firstName) throw new Error("My list showed the wrong scholarship: " + savedName);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.click("#btnScholarships");
  await page.waitForSelector("#screen-scholarships", { state: "visible" });
  const chipLabel = await page.textContent("[data-scholar-saved]");
  if (!/My list \(1\)/.test(chipLabel)) throw new Error("saved scholarship did not survive a reload: " + chipLabel);

  await page.fill("#scholarQuery", "zzzzzz-no-match");
  await page.waitForTimeout(150);
  if (!(await page.isVisible(".scholar-empty"))) throw new Error("empty state did not render for a no-match search");
  await page.click("#scholarResetEmpty");
  await page.waitForTimeout(150);
  const resetCount = await page.locator(".scholar-card").count();
  if (resetCount !== total) throw new Error("reset from the empty state did not restore the full list");

  await page.fill("#scholarQuery", "first-generation");
  await page.waitForTimeout(150);
  const firstGen = await page.locator(".scholar-card").count();
  if (firstGen < 3) throw new Error("keyword search for first-generation returned too few scholarships");

  fs.mkdirSync(SHOTS, { recursive: true });
  await page.fill("#scholarQuery", "");
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, "scholarships.png"), fullPage: false });

  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  console.log("PASS: scholarship searcher opens from the top tile, searches, filters, saves, persists, and resets cleanly.");
  await browser.close();
})().catch((err) => { console.error("FAIL: " + err.message); process.exit(1); });
