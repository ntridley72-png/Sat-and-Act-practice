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

  // The arcade display font is fetched from Google Fonts; stub it as well so
  // the suite never depends on third-party hosts (sandbox networks often
  // cannot reach them, and the test never asserts on typeface rendering).
  await page.route("**://fonts.googleapis.com/**", (route) => route.fulfill({
    status: 200, contentType: "text/css", body: "/* stubbed */",
  }));
  await page.route("**://fonts.gstatic.com/**", (route) => route.fulfill({
    status: 200, contentType: "font/woff2", body: "",
  }));

  // Commons photos are stubbed so the layout is measured, not the network.
  // Registered before the first detail panel opens: the sandbox this suite
  // runs in cannot reach upload.wikimedia.org (IPv6 hang), and the photo
  // credit assertions below read the DOM, not the pixels.
  await page.route("**://*.wikimedia.org/**", (route) => route.fulfill({
    status: 200, contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axnLlcAAAAASUVORK5CYII=", "base64"),
  }));

  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");

  // Open college feature from the top bar.
  await page.click("#btnCollege");
  await page.waitForSelector("#screen-college", { state: "visible" });
  await page.click("#ccAdd");
  const rowCount = await page.locator(".college-row").count();
  if (rowCount < 20) throw new Error("expected 300+ college dataset results, saw " + rowCount + " rows rendered");

  // Search by common abbreviation, select, then enter a score and read the estimate.
  await page.fill("#collegeQuery", "UCLA");
  await page.waitForFunction(() => [...document.querySelectorAll(".college-row .college-name")].some((el) => el.textContent.includes("Los Angeles")));
  const ucla = await page.locator(".college-row", { hasText: "University of California-Los Angeles" }).count();
  if (!ucla) throw new Error("UCLA abbreviation search did not find the college");
  await page.click(".college-row-main");
  await page.waitForSelector("#collegeDetail");
  await page.fill("#ccSat", "1400");
  await page.dispatchEvent("#ccSat", "change");
  await page.waitForSelector(".college-detail .college-pie");
  const firstEstimate = await page.textContent(".college-detail .pie-center");
  await page.click(".college-detail [data-save]");
  await page.click("[data-close-detail]");
  await page.fill("#collegeQuery", "University of Michigan");
  await page.waitForTimeout(300);
  await page.click(".college-row-main");
  await page.waitForSelector(".college-detail .college-pie");
  await page.click(".college-detail [data-save]");
  await page.waitForSelector(".cc-card");
  if ((await page.locator(".cc-card").count()) < 2) throw new Error("saved colleges did not render as comparison cards");

  await page.click("[data-close-detail]").catch(() => {});
  await page.waitForTimeout(250);
  // The X removes a card without navigating; the card link navigates to /colleges/<slug>/.
  const before = await page.locator(".cc-card").count();
  const urlBefore = page.url();
  await page.locator(".cc-card .cc-remove").first().click();
  await page.waitForTimeout(250);
  const after = await page.locator(".cc-card").count();
  if (after !== before - 1) throw new Error("X did not remove a card from the list");
  if (page.url() !== urlBefore) throw new Error("X unexpectedly navigated away");
  await page.route("**/colleges/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>college stub</title>" }));
  const href = await page.locator(".cc-card .cc-link").first().getAttribute("href");
  if (!/^\/colleges\/[a-z0-9-]+\/$/.test(href)) throw new Error("card link is not a /colleges/<slug>/ URL: " + href);
  await page.locator(".cc-card .cc-link").first().click();
  await page.waitForTimeout(400);
  if (!/\/colleges\//.test(page.url())) throw new Error("card click did not navigate to the college page: " + page.url());
  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.click("#btnCollege");
  await page.waitForSelector("#screen-college", { state: "visible" });

  // The current detail view is a responsive modal; close it before changing layouts.
  await page.click("[data-close-detail]").catch(() => {});

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
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  const savedScore = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("satPrepProfile_v1") || "{}");
    return raw.college && raw.college.sat;
  });
  if (savedScore !== 1400) throw new Error("college profile did not persist, saw " + savedScore);

  // Start screen entry card exists.
  const startCard = await page.locator("#collegeStart").count();
  if (!startCard) throw new Error("missing college card on the start screen");
  const scholarCard = await page.locator("#scholarshipStart").count();
  if (!scholarCard) throw new Error("missing scholarship card on the start screen");

  // College photos: a data-backed college renders a styled, lazy campus photo with attribution, and broken images hide themselves.
  await page.click("#btnCollege");
  await page.waitForSelector("#screen-college", { state: "visible" });
  await page.click("#ccAdd");
  await page.fill("#collegeQuery", "Auburn");
  await page.waitForTimeout(250);
  await page.locator('.college-row:has(.college-name:text-is("Auburn University")) .college-row-main').click();
  await page.waitForSelector("#collegeDetail");
  const photo = await page.evaluate(() => {
    const fig = document.querySelector("#collegeDetail .college-photo");
    if (!fig) return null;
    const img = fig.querySelector("img");
    const css = getComputedStyle(img);
    return { alt: img.getAttribute("alt"), loading: img.getAttribute("loading"), aspect: css.aspectRatio, fit: css.objectFit, caption: (fig.querySelector("figcaption") || {}).textContent || "", onerror: img.getAttribute("onerror") || "" };
  });
  if (!photo) throw new Error("Auburn University should render a campus photo from Wikimedia data");
  if (!/ at Auburn University$/.test(photo.alt) || /^Campus photo/.test(photo.alt)) {
    throw new Error("photo alt text should be the category label, saw: " + photo.alt);
  }
  if (photo.loading !== "lazy") throw new Error("photo should lazy-load");
  if (!/16\s*\/\s*9/.test(photo.aspect)) throw new Error("photo aspect ratio CSS not applied: " + photo.aspect);
  if (photo.fit !== "cover") throw new Error("photo object-fit CSS not applied: " + photo.fit);
  if (!/Wikimedia|Public domain|CC/.test(photo.caption)) throw new Error("photo attribution missing: " + photo.caption);
  if (!photo.onerror) throw new Error("photo has no broken-image fallback");

  // No A–D grade: a factual size/setting snapshot stands in its place.
  const social = await page.evaluate(() => ({
    chips: document.querySelectorAll("#collegeDetail .cf-grade").length,
    copy: /App estimate \(A[–-]D\)|letter grade/i.test(document.querySelector("#collegeDetail").textContent),
    snapshot: ((document.querySelector("#collegeDetail .cf-social-snapshot") || {}).textContent || "").trim(),
  }));
  if (social.chips || social.copy) throw new Error("the letter grade must be gone from the profile");
  if (!/^(Very large|Large|Mid-sized|Small|Very small) · (city|suburban|college-town|rural)$/.test(social.snapshot)) {
    throw new Error("size/setting snapshot missing or malformed: " + social.snapshot);
  }

  // Photo credits link to the Commons file page with photographer plus license.
  const photoCredit = await page.evaluate(() => {
    const fig = document.querySelector("#collegeDetail .college-photo");
    const a = fig ? fig.querySelector("figcaption a") : null;
    const cap = fig ? (fig.querySelector("figcaption") || {}).textContent || "" : "";
    return { creditHref: a ? a.getAttribute("href") : "", caption: cap };
  });
  if (photoCredit.creditHref && !/^https:\/\/commons\.wikimedia\.org\//.test(photoCredit.creditHref)) {
    throw new Error("photo credit must link to the Commons file page, saw: " + photoCredit.creditHref);
  }
  if (!/ · /.test(photoCredit.caption)) throw new Error("photo credit needs photographer plus license: " + photoCredit.caption);

  // School-life buttons open verified sections INSIDE FunSAT.
  const lifeButtons = await page.evaluate(() => Array.from(document.querySelectorAll("#collegeDetail [data-life-section]")).map((b) => b.dataset.lifeSection + ":" + b.textContent.trim()));
  if (lifeButtons.length !== 6) throw new Error("six school-life buttons expected, saw " + lifeButtons.length + " " + JSON.stringify(lifeButtons));
  const wantSections = [["clubs", "Student organizations"], ["greek", "Greek life"], ["athletics", "Athletics & recreation"], ["events", "Events & traditions"], ["housing", "Housing & dining"], ["paper", "Student newspaper"]];
  wantSections.forEach(([key, label]) => {
    if (!lifeButtons.some((b) => b.startsWith(key + ":") && b.includes(label))) throw new Error("missing school-life button " + key + " in " + JSON.stringify(lifeButtons));
  });

  await page.click('#collegeDetail [data-life-section="greek"]');
  await page.waitForTimeout(180);
  const greekSection = await page.evaluate(() => {
    const s = document.querySelector("#collegeDetail .life-section");
    const a = s && s.querySelector(".life-source a");
    return {
      present: !!s,
      label: s ? s.querySelector("h3").textContent.trim() : "",
      href: a ? a.getAttribute("href") : "",
      verified: !!s && /Verified official page/.test(s.textContent),
      dated: !!s && /Checked 2026-10-10/.test(s.textContent),
      hash: location.hash,
      back: !!(s && s.querySelector("[data-life-back]")),
    };
  });
  if (!greekSection.present) throw new Error("the school-life section must open inside FunSAT");
  if (!/Greek life · Auburn University/.test(greekSection.label)) throw new Error("section heading lost the college identity: " + greekSection.label);
  if (!/^https:\/\/auburn\.edu\//.test(greekSection.href)) throw new Error("verified link must open on the official host: " + greekSection.href);
  if (!greekSection.verified || !greekSection.dated) throw new Error("verified link needs its badge and checked date");
  if (greekSection.hash !== "#college/100858/greek") throw new Error("the section must be reflected in the URL hash, saw " + greekSection.hash);
  if (!greekSection.back) throw new Error("the section needs working Back navigation");

  // Refresh with the hash keeps the college and the open section.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.waitForTimeout(250);
  const afterReload = await page.evaluate(() => ({
    section: !!document.querySelector("#collegeDetail .life-section"),
    name: (document.querySelector("#collegeDetail h3") || {}).textContent || "",
    hash: location.hash,
  }));
  if (!afterReload.section || afterReload.hash !== "#college/100858/greek") throw new Error("refresh must reopen the section: " + JSON.stringify(afterReload));
  if (!/Auburn University/.test(afterReload.name)) throw new Error("refresh must keep the college identity");

  // Back returns to the overview and clears the section hash.
  await page.click("#collegeDetail [data-life-back]");
  await page.waitForTimeout(160);
  const afterBack = await page.evaluate(() => ({
    section: !!document.querySelector("#collegeDetail .life-section"),
    overview: !!document.querySelector("#collegeDetail .college-stats"),
    hash: location.hash,
  }));
  if (afterBack.section || !afterBack.overview) throw new Error("Back must return to the college overview");
  if (/#college\/100858\/greek/.test(afterBack.hash)) throw new Error("Back must clear the section from the URL: " + afterBack.hash);

  // The newspaper section (Auburn has no verified link) is an honest gap.
  await page.click('#collegeDetail [data-life-section="paper"]');
  await page.waitForTimeout(160);
  const paperSection = await page.evaluate(() => {
    const s = document.querySelector("#collegeDetail .life-section");
    const direct = s ? Array.from(s.querySelectorAll(".life-source a")).map((a) => a.getAttribute("href")) : [];
    return { text: s ? s.textContent : "", direct, present: !!s };
  });
  if (!paperSection.present) throw new Error("the newspaper section must still open");
  if (!/No verified page yet/.test(paperSection.text)) throw new Error("missing coverage must be an honest empty state");
  if (!/coverage gap/.test(paperSection.text)) throw new Error("the empty state must say it is a coverage gap");
  if (paperSection.direct.some((h) => h && !/google\./i.test(h))) throw new Error("no unverified direct link may be presented as the section");
  if (paperSection.direct.some((h) => h && !decodeURIComponent(h).includes("site:auburn.edu"))) throw new Error("search fallback must be limited to the official host: " + JSON.stringify(paperSection.direct));
  await page.click("#collegeDetail [data-life-back]");
  await page.waitForTimeout(160);

  // Safety disclosure: collapsed by default; Auburn is outside the pilot.
  const safety = await page.evaluate(() => {
    const d = document.querySelector("#collegeDetail .safety-disclosure");
    return { present: !!d, open: d ? d.open : null, text: d ? d.textContent : "" };
  });
  if (!safety.present) throw new Error("the safety disclosure must exist");
  if (safety.open) throw new Error("safety details must be collapsed by default");
  if (!/2025 official data is not yet available/i.test(safety.text)) throw new Error("the disclosure must state that 2025 data is unavailable");
  if (!/not in that pilot/.test(safety.text)) throw new Error("a non-pilot college must show the honest coverage note, not numbers");

  // A pilot college (Berkeley) shows the cross-checked tables in the app too.
  await page.click("[data-close-detail]");
  await page.waitForTimeout(160);
  // The reload reset the in-memory drawer state; reopen it before searching.
  const drawerOpen = await page.evaluate(() => { const d = document.getElementById("ccSearchDrawer"); return !!(d && !d.hidden); });
  if (!drawerOpen) await page.click("#ccAdd");
  await page.fill("#collegeQuery", "Berkeley");
  await page.waitForTimeout(400);
  await page.locator('.college-row:has(.college-name:text-is("University of California-Berkeley")) .college-row-main').click();
  await page.waitForTimeout(220);
  const pilotSafety = await page.evaluate(() => {
    const d = document.querySelector("#collegeDetail .safety-disclosure");
    if (!d) return null;
    d.open = true;
    const tables = d.querySelectorAll(".safety-table table").length;
    return {
      tables,
      housingNote: /subset of on-campus/i.test(d.textContent),
      rescope: /Noncampus and public-property scopes are kept separate/i.test(d.textContent),
      unfounded: /Unfounded crimes/i.test(d.textContent),
      summary: d.querySelector("summary").textContent,
    };
  });
  if (!pilotSafety || pilotSafety.tables < 4) throw new Error("pilot safety tables must render, saw " + JSON.stringify(pilotSafety && pilotSafety.tables));
  if (!pilotSafety.housingNote) throw new Error("housing must stay labeled as a subset of on-campus");
  if (!pilotSafety.rescope || !pilotSafety.unfounded) throw new Error("scopes and unfounded must stay distinct");
  if (!/2022–2024/.test(pilotSafety.summary)) throw new Error("the summary must show the covered years: " + pilotSafety.summary);
  await page.click("[data-close-detail]");

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
  console.log("PASS: college UI loads, searches by abbreviation, estimates, saves, compares, themes, and persists. Estimate seen: " + firstEstimate);
})().catch((error) => { console.error(error); process.exit(1); });
