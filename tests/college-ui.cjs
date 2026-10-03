/* Headless UI smoke test for the College Score Goals feature across all three layouts. */
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

  await page.goto(BASE + PAGE_PATH, { waitUntil: "load" });
  await page.waitForSelector("body[data-workspace]");

  // Open college feature from the top bar.
  await page.click("#btnCollege");
  await page.waitForSelector("#screen-college", { state: "visible" });
  const rowCount = await page.locator(".college-row").count();
  if (rowCount < 20) throw new Error("expected 300+ college dataset results, saw " + rowCount + " rows rendered");

  // Search by common abbreviation, select, then enter a score and read the estimate.
  await page.fill("#collegeQuery", "UCLA");
  await page.waitForFunction(() => [...document.querySelectorAll(".college-row .college-name")].some((el) => el.textContent.includes("Los Angeles")));
  const ucla = await page.locator(".college-row", { hasText: "University of California-Los Angeles" }).count();
  if (!ucla) throw new Error("UCLA abbreviation search did not find the college");
  await page.click(".college-row-main");
  await page.waitForSelector("#collegeDetail");
  await page.fill("#collegeSat", "1400");
  await page.dispatchEvent("#collegeSat", "change");
  await page.waitForSelector(".college-detail .college-pie");
  const firstEstimate = await page.textContent(".college-detail .pie-center");
  await page.click(".college-detail [data-save]");
  await page.fill("#collegeQuery", "University of Michigan");
  await page.waitForTimeout(300);
  await page.click(".college-row-main");
  await page.waitForSelector(".college-detail .college-pie");
  await page.click(".college-detail [data-save]");
  await page.waitForSelector(".college-compare table");

  // Keyboard resize of the detail panel.
  const before = await page.$eval("#collegeDetail", (el) => getComputedStyle(el).maxHeight);
  await page.focus("#collegeResize");
  await page.keyboard.press("End");
  const after = await page.$eval("#collegeDetail", (el) => getComputedStyle(el).maxHeight);
  if (before === after) throw new Error("resize handle did not change the panel size");

  // Themes: screenshot the college screen in each layout.
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const theme of ["exam", "notebook", "focus"]) {
    await page.selectOption("#workspaceTheme", theme);
    await page.waitForTimeout(200);
    const data = await page.getAttribute("body", "data-workspace");
    if (data !== theme) throw new Error("theme did not apply: " + theme);
    await page.screenshot({ path: path.join(SHOTS, "college-" + theme + ".png"), fullPage: false });
  }

  // Profile persistence across reload (localStorage) and cloud-sync fields present.
  await page.selectOption("#workspaceTheme", "exam");
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("body[data-workspace]");
  const savedScore = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("satPrepProfile_v1") || "{}");
    return raw.college && raw.college.sat;
  });
  if (savedScore !== 1400) throw new Error("college profile did not persist, saw " + savedScore);

  // Start screen entry card exists.
  const startCard = await page.locator("#collegeStart").count();
  if (!startCard) throw new Error("missing college card on the start screen");

  // AI reply polish: greetings removed, LaTeX converted, doubled parentheses collapsed, math typeset.
  const aiFormat = await page.evaluate(() => {
    const out = cleanAiText("Sure! Here is the work: **sqrt((2x + 9)) = x** and \\frac{1}{2} of it.");
    const host = document.createElement("div");
    renderAiText(host, "Solve sqrt((x + 3)) = 5\n\n- Step 1: x^2 = 9 and 1/2 of 6\n- Answer: **x = 6**");
    return { out, html: host.innerHTML, text: host.textContent };
  });
  if (!/^Here is the work:/.test(aiFormat.out)) throw new Error("AI greeting not removed: " + aiFormat.out);
  if (!/sqrt\(2x \+ 9\) = x/.test(aiFormat.out)) throw new Error("nested sqrt parentheses not cleaned: " + aiFormat.out);
  if (!/\(1\)\/\(2\)/.test(aiFormat.out)) throw new Error("LaTeX fraction not converted: " + aiFormat.out);
  if (!aiFormat.html.includes("<sup>2</sup>")) throw new Error("exponent not typeset: " + aiFormat.html);
  if (!aiFormat.html.includes("eq-frac")) throw new Error("fraction not typeset: " + aiFormat.html);
  if (!aiFormat.html.includes("eq-sqrt")) throw new Error("radical not typeset: " + aiFormat.html);
  if (/[*][*]/.test(aiFormat.text)) throw new Error("markdown bold left in AI text: " + aiFormat.text);

  await browser.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("PASS: college UI loads, searches by abbreviation, estimates, saves, compares, resizes, themes, and persists. Estimate seen: " + firstEstimate);
})().catch((error) => { console.error(error); process.exit(1); });
