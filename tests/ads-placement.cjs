/* Ads sit in good spots: enough to pay for the site, never where a stray click could land on one.
 *
 * Every app screen and a sample of the generated pages (guide, college, scholarship, landing) are opened as the live site,
 * at a desktop and a phone width, with a stand-in ad network that always fills. Each page is scrolled top to bottom, then
 * left idle so every ad that is going to appear has appeared. Then, for every ad that is showing:
 *   - it keeps at least 56px from every button, link and field (a fixed side rail keeps clear of all of them);
 *   - no button, link or field has an ad on top of it (checked at its centre at every scroll position);
 *   - the page carries no more ads than the plan allows (one in-content unit per screen, plus the side rail on wide screens);
 * and the places that must never carry an ad (the Plan form, a running test, the arcade, dialogs) carry none.
 * Needs the source tree on http://localhost:8899 and a built public/ on http://localhost:8898. */
const { chromium, EXEC, openApp, visibleAds } = require("./ads-harness.cjs");

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const MIN_GAP = 56;

// Everything measured in the page: each shown ad's gap to the nearest control, and every control an ad covers.
async function measure(page) {
  return page.evaluate((MIN_GAP) => {
    const INTERACTIVE = "a[href],button,input,select,textarea,summary,[role=button]";
    const inFixedBar = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "fixed" || p === "sticky") return true; } return false; };
    // Really on screen: laid out, not hidden, and not clipped away by an overflow:hidden ancestor (a collapsed panel).
    // Controls inside a closed <details> are not on screen (the browser skips their contents) even though they report a box.
    const inClosedDetails = (e) => { const d = e.closest("details"); return !!d && !d.open && !(e.tagName === "SUMMARY" && e.parentElement === d); };
    const visible = (e) => {
      if (inClosedDetails(e)) return false;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!(r.width > 3 && r.height > 3 && cs.visibility !== "hidden" && cs.display !== "none" && !e.closest("[hidden]") && !e.closest(".is-loading"))) return false;
      for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY)) { const b = n.getBoundingClientRect(); if (r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right) return false; }
      }
      return true;
    };
    const doc = (e) => { const r = e.getBoundingClientRect(); return { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY }; };
    const gap = (a, b) => Math.round(Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom)));
    const label = (c) => (c.id ? "#" + c.id : c.tagName.toLowerCase()) + " '" + (c.textContent || "").trim().slice(0, 20) + "'";
    // What a tap would really reach: controls on screen right now whose own centre is hit-testable (not a hidden or clipped
    // panel that merely has a layout box). Every control gets its turn as the page is scrolled past.
    const onScreen = [...document.querySelectorAll(INTERACTIVE)].filter((e) => !e.closest("[data-ad-slot]") && visible(e)).filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
    const hit = (e) => { const r = e.getBoundingClientRect(); return document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); };
    const real = [], coveredBy = [];
    for (const c of onScreen) {
      const top = hit(c);
      if (!top) continue;
      if (top === c || c.contains(top) || top.contains(c)) real.push(c);
      else if (top.closest("[data-ad-slot]") || (top.tagName === "IFRAME" && top.title === "Sponsored")) coveredBy.push(c);
    }
    const scrolling = real.filter((e) => !inFixedBar(e));
    const slots = [...document.querySelectorAll("[data-ad-slot]")].filter((h) => h.dataset.adState === "shown" && visible(h));
    const out = { shown: slots.map((h) => h.dataset.adSlot), tooClose: [], covered: coveredBy.map((c) => label(c) + " is under an ad"), fixedCount: 0, inContent: 0 };
    for (const h of slots) {
      const fixed = getComputedStyle(h).position === "fixed";
      if (fixed) out.fixedCount++; else out.inContent++;
      if (fixed) {
        // A rail follows the reader, so it must clear every control sideways (16px), wherever the page is scrolled.
        const r = h.getBoundingClientRect();
        for (const c of scrolling) { const b = c.getBoundingClientRect(); if (b.right > r.left - 16 && b.left < r.right + 16) out.tooClose.push(h.dataset.adSlot + " shares a column with " + label(c)); }
      } else {
        const r = doc(h);
        for (const c of scrolling) { const d = gap(r, doc(c)); if (d < MIN_GAP) out.tooClose.push(h.dataset.adSlot + " is " + d + "px from " + label(c)); }
      }
    }
    return out;
  }, MIN_GAP);
}

// Scroll top to bottom (checking for covered controls at every stop), then sit still so every pending ad can appear.
async function scrollThrough(page) {
  const acc = { tooClose: new Set(), covered: new Set(), shown: new Set(), maxFixed: 0, maxInContent: 0 };
  const take = (m) => { m.tooClose.forEach((x) => acc.tooClose.add(x)); m.covered.forEach((x) => acc.covered.add(x)); m.shown.forEach((x) => acc.shown.add(x)); acc.maxFixed = Math.max(acc.maxFixed, m.fixedCount); acc.maxInContent = Math.max(acc.maxInContent, m.inContent); };
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = 500, stops = Math.min(Math.ceil(height / step), 24);
  for (let i = 0; i <= stops; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * step);
    await page.waitForTimeout(320);
    take(await measure(page));
  }
  await page.waitForTimeout(1900);
  take(await measure(page));
  return acc;
}

const SPA = [
  ["home", "#btnHome"], ["subjects", "#btnSubjectPractice"], ["plan", "#btnPlan"], ["college", "#btnCollege"], ["scholarships", "#btnScholarships"],
];
const STATIC = [
  ["guide", "/guides/how-to-write-a-scholarship-essay/"], ["college page", "/colleges/alcorn-state-university/"],
  ["scholarship page", "/scholarships/acs-scholars/"], ["landing page", "/sat-practice/"],
];

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  for (const [label, viewport] of [["desktop 1440", { width: 1440, height: 900 }], ["wide 1920", { width: 1920, height: 1000 }], ["phone 390", { width: 390, height: 800 }]]) {
    const phone = viewport.width <= 700, wide = viewport.width >= 1700;

    // ---------- the app's screens
    {
      const { ctx, page, tabs } = await openApp(browser, "hostile", viewport);
      for (const [name, sel] of SPA) {
        await page.evaluate((s) => document.querySelector(s).click(), sel);
        await page.waitForTimeout(600);
        const acc = await scrollThrough(page);
        const where = label + " / app " + name;
        ok(acc.tooClose.size === 0, where + ": an ad is too close to a control: " + [...acc.tooClose].slice(0, 3).join("; "));
        ok(acc.covered.size === 0, where + ": a control is under an ad: " + [...acc.covered].slice(0, 3).join("; "));
        ok(acc.maxInContent <= 1, where + ": " + acc.maxInContent + " in-content ads showing at once (plan allows 1)");
        if (name === "plan") ok(acc.shown.size === 0 || [...acc.shown].every((n) => n === "app-rail"), where + ": the Plan form carries an ad (" + [...acc.shown].join(",") + ")");
        if (!wide) ok(!acc.shown.has("app-rail"), where + ": the side rail showed below 1700px");
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      // Results (after a short test), and the places that must carry nothing.
      await page.evaluate(() => { document.getElementById("btnHome").click(); state.cfg.testType = "sat"; state.cfg.section = "rw"; state.cfg.total = 4; });
      await page.click("#btnStart"); await page.waitForSelector("#questionCard .choice");
      for (let i = 0; i < 2; i++) { await page.locator("#questionCard .choice").nth(i % 2).click().catch(() => {}); await page.click("#btnCheck").catch(() => {}); await page.waitForTimeout(150); const nx = await page.$("#btnNext"); if (nx) await nx.click().catch(() => {}); await page.waitForTimeout(150); }
      const inTest = await measure(page);
      ok(inTest.shown.length === 0, label + " / test: ads showing during a test: " + inTest.shown.join(","));
      await page.evaluate(() => { finalizeAttempt(true); state.view = "results"; render(); });
      await page.waitForTimeout(600);
      const acc = await scrollThrough(page);
      ok(acc.tooClose.size === 0, label + " / results: an ad is too close to a control: " + [...acc.tooClose].slice(0, 3).join("; "));
      ok(acc.covered.size === 0, label + " / results: a control is under an ad");
      ok(acc.maxInContent <= 1, label + " / results: " + acc.maxInContent + " in-content ads at once");
      await page.evaluate(() => { state.view = "start"; render(); arcade.open(); });
      await page.waitForTimeout(500);
      ok((await visibleAds(page)).length === 0, label + " / arcade: an ad is showing in the arcade: " + JSON.stringify(await visibleAds(page)));
      ok(tabs.length === 0, label + ": a click opened a tab");
      await ctx.close();
    }

    // ---------- generated pages
    for (const [name, path] of STATIC) {
      const { ctx, page, tabs } = await openApp(browser, "hostile", viewport, path);
      await page.waitForTimeout(900);
      const acc = await scrollThrough(page);
      const where = label + " / " + name;
      ok(acc.tooClose.size === 0, where + ": an ad is too close to a link: " + [...acc.tooClose].slice(0, 3).join("; "));
      ok(acc.covered.size === 0, where + ": a link is under an ad: " + [...acc.covered].slice(0, 3).join("; "));
      ok(acc.maxInContent <= (phone ? 3 : 1), where + ": " + acc.maxInContent + " in-content ads showing at once");
      ok(acc.maxFixed <= 1, where + ": " + acc.maxFixed + " side rails");
      if (phone) ok(acc.maxFixed === 0, where + ": a side rail showed on a phone");
      ok(tabs.length === 0, where + ": a click opened a tab");
      await ctx.close();
    }
  }

  // ---------- far-off units are not even requested until the reader gets near them
  {
    const { ctx, page } = await openApp(browser, "hostile", { width: 1440, height: 900 });
    await page.evaluate(() => document.getElementById("btnScholarships").click());
    await page.waitForTimeout(1500);
    const lazy = await page.evaluate(() => { const h = document.querySelector("[data-ad-slot='scholarships-list']"); return { top: Math.round(h.previousElementSibling ? h.previousElementSibling.getBoundingClientRect().bottom + scrollY : 0), mounted: !!h.dataset.adMounted, vh: innerHeight }; });
    ok(lazy.top < lazy.vh + 1200 || !lazy.mounted, "a slot " + lazy.top + "px down the Scholarships list was requested at load (should wait until within a screen of the reader)");
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: ads keep clear of every control, cover none, stay within the one-in-content-unit plan, are absent from the Plan form, tests and arcade, and load only near the reader.");
})().catch((e) => { console.error(e); process.exit(1); });
