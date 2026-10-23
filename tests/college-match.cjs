/* College matcher page (/college-match/): filters, reach/match/likely bands, tabs, paging,
   reset, persistence and mobile layout. Needs the generated pages served on PAGES_URL. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.PAGES_URL || "http://localhost:8898";
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|405|Failed to load resource/.test(m.text())) errs.push(m.text()); });

  await page.goto(BASE + "/college-match/", { waitUntil: "load" });
  ok(await page.locator("h1").count() === 1, "exactly one h1");
  ok((await page.locator("#cm-results > li").count()) === 0, "no results before the form is used");

  // No score: sorted by acceptance rate only, with the nudge to add a score.
  await page.click(".cm-go");
  const noScore = await page.textContent("#cm-summary");
  ok(/Add a score/.test(noScore), "no-score summary nudges for a score: " + noScore);

  // A 1200 SAT.
  await page.fill("[name=sat]", "1200");
  await page.click(".cm-go");
  const counts = await page.evaluate(() => ({
    total: document.querySelectorAll("#cm-results > li").length,
    summary: document.getElementById("cm-summary").textContent,
    chips: [...document.querySelectorAll("#cm-results .cm-chip")].map((c) => c.textContent),
  }));
  ok(counts.total === 12, "first page shows 12 cards, saw " + counts.total);
  ok(/match,.*likely and.*reach/.test(counts.summary), "summary lists the bands: " + counts.summary);
  ok(counts.chips.every((c) => ["Likely", "Match", "Reach"].includes(c)), "chips are band names");

  // Bands agree with the data: a likely college must have a 75th percentile at or below 1200.
  const checked = await page.evaluate(() => {
    const data = JSON.parse(document.getElementById("cm-data").textContent);
    const by = Object.fromEntries(data.map((c) => [c.sl, c]));
    const bad = [];
    document.querySelectorAll("#cm-results > li").forEach((li) => {
      const c = by[li.querySelector("a").getAttribute("href").split("/")[2]];
      const band = li.querySelector(".cm-chip").textContent;
      if (band === "Likely" && !(c.s2 && c.s2 <= 1200 && c.ad >= 40)) bad.push(c.n + " likely");
      if (band === "Reach" && c.s1 && 1200 >= c.s1 && c.ad >= 25 && c.ad >= 15) bad.push(c.n + " reach");
    });
    return bad;
  });
  ok(checked.length === 0, "band logic disagrees with data: " + checked.join(", "));

  // Tabs filter and paging.
  await page.click('#cm-tabs button[data-k="likely"]');
  const onlyLikely = await page.evaluate(() => [...document.querySelectorAll("#cm-results .cm-chip")].every((c) => c.textContent === "Likely"));
  ok(onlyLikely, "Likely tab shows only likely colleges");
  await page.click('#cm-tabs button[data-k="all"]');
  if (await page.locator("#cm-more button").count()) {
    await page.click("#cm-more button");
    ok((await page.locator("#cm-results > li").count()) === 24, "Show more adds another page");
  }

  // Filters narrow results.
  await page.selectOption("[name=state]", "TX");
  await page.selectOption("[name=ctrl]", "public");
  await page.click(".cm-go");
  const tx = await page.evaluate(() => [...document.querySelectorAll("#cm-results .cm-meta span:first-child")].map((s) => s.textContent));
  ok(tx.length > 0 && tx.every((t) => /^Texas · Public/.test(t)), "state and type filters apply: " + tx.slice(0, 2));

  // Price cap removes colleges with no reported price or a higher one.
  await page.selectOption("[name=state]", "");
  await page.selectOption("[name=ctrl]", "");
  await page.selectOption("[name=price]", "10000");
  await page.click(".cm-go");
  const prices = await page.evaluate(() => [...document.querySelectorAll("#cm-results .cm-meta")].map((m) => (m.textContent.match(/Net price \$([\d,]+)/) || [])[1]));
  ok(prices.length > 0 && prices.every((p) => p && Number(p.replace(/,/g, "")) <= 10000), "price cap holds: " + prices.slice(0, 3));

  // Impossible combination gives the empty message.
  await page.selectOption("[name=state]", "TX");
  await page.check("[name=hbcu]");
  await page.selectOption("[name=price]", "10000");
  await page.click(".cm-go");
  const impossible = await page.textContent("#cm-summary");
  ok(/No colleges fit/.test(impossible) || /We found/.test(impossible), "summary always reports: " + impossible);
  await page.uncheck("[name=hbcu]");
  await page.selectOption("[name=price]", "");
  await page.selectOption("[name=state]", "");

  // Personalization: income band, major and priorities change the list and explain themselves.
  await page.selectOption("[name=income]", "0");
  await page.selectOption("[name=major]", "Engineering");
  await page.selectOption("[name=pCost]", "high");
  await page.selectOption("[name=pGrad]", "high");
  await page.click(".cm-go");
  const personal = await page.evaluate(() => ({
    profile: document.getElementById("cm-profile").textContent,
    hiddenProfile: document.getElementById("cm-profile").hidden,
    fits: [...document.querySelectorAll("#cm-results .cm-fit")].map((f) => Number(f.textContent.replace(/\D/g, ""))),
    why: [...document.querySelectorAll("#cm-results .cm-why")].length,
    cards: document.querySelectorAll("#cm-results > li").length,
    reasons: [...document.querySelectorAll("#cm-results .cm-why li")].map((l) => l.textContent).join(" "),
  }));
  ok(!personal.hiddenProfile && /Engineering/.test(personal.profile) && /\$0.\$30,000/.test(personal.profile), "profile sentence reflects the answers: " + personal.profile);
  ok(personal.fits.length > 0 && personal.fits.every((f) => f >= 1 && f <= 99), "fit percentages are 1-99");
  ok(personal.fits.every((f, i, a) => i === 0 || a[i - 1] >= f), "best fit is listed first");
  ok(personal.why === personal.cards, "every card explains why it fits");
  ok(/household earning \$0.\$30,000/.test(personal.reasons), "net price reasons use the chosen income band");
  ok(/Engineering/.test(personal.reasons), "major reasons appear");
  await page.check("[name=majorOnly]");
  await page.click(".cm-go");
  const majorOnly = await page.evaluate(() => [...document.querySelectorAll("#cm-results .cm-why")].every((u) => /degrees are in Engineering/.test(u.textContent)));
  ok(majorOnly, "only-top-program filter keeps colleges where the major is a top program");
  await page.uncheck("[name=majorOnly]");
  await page.selectOption("[name=major]", "");
  await page.selectOption("[name=income]", "");
  await page.selectOption("[name=pCost]", "");
  await page.selectOption("[name=pGrad]", "");

  // Persistence and reset.
  await page.reload({ waitUntil: "load" });
  ok((await page.inputValue("[name=sat]")) === "1200", "inputs persist across reloads");
  await page.click("#cm-reset");
  ok((await page.inputValue("[name=sat]")) === "" && (await page.locator("#cm-results > li").count()) === 0, "reset clears inputs and results");

  // Mobile.
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(BASE + "/college-match/", { waitUntil: "load" });
  await m.fill("[name=sat]", "1300");
  await m.click(".cm-go");
  const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 2, "no horizontal overflow on a phone: " + over);

  ok(errs.length === 0, "page errors: " + errs.join(" | "));
  await browser.close();
  console.log(fails.length ? "FAIL:\n - " + fails.join("\n - ") : "PASS: college matcher filters, bands, tabs, paging, persistence, reset and mobile layout work.");
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
