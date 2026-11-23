/* Ads only react to clicks on the ad itself, and never pop in under your cursor.
 *
 * The app is served under the funsat.bid hostname (so the production ad path runs) and the ad network's scripts are
 * replaced with stand-ins (see ads-harness.cjs): one that tries to open a new tab on ANY click it can see, one that shows
 * a flirty listing, one that never fills, one that fills late. This proves, with no real ad traffic, that:
 *   - third-party ad code never runs in the page itself, only inside sandboxed frames that cannot see our clicks;
 *   - clicking anything that is not an ad (navigation, dialogs, buttons, blank page) never opens a tab or navigates;
 *   - clicking an ad still works (it opens its own landing page);
 *   - a flirty listing is taken down, and a unit that never fills takes no space at all;
 *   - an ad that fills late does not move anything while you are using the page, and appears once you pause;
 *   - no ad is on screen while a test is running, paused, or in full screen, nor anywhere in the arcade.
 * Needs the source tree on http://localhost:8899 and a built public/ on http://localhost:8898. */
const { chromium, EXEC, openApp, visibleAds } = require("./ads-harness.cjs");

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const homeSlotState = (page) => page.evaluate(() => { const h = document.querySelector("[data-ad-slot='home-sidebar']"); return h ? { state: h.dataset.adState || "", hidden: h.hidden, height: Math.round(h.getBoundingClientRect().height) } : null; });

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

  // =================== 1) hostile network on a wide screen (native unit, sky rail)
  {
    const { ctx, page, tabs, errs } = await openApp(browser, "hostile", { width: 1600, height: 900 });
    await page.waitForFunction(() => document.querySelector("[data-ad-slot='home-sidebar']")?.dataset.adState === "shown", null, { timeout: 15000 }).catch(() => {});
    const frames = await page.evaluate(() => [...document.querySelectorAll("iframe[title=Sponsored]")].map((f) => ({ native: !!f.dataset.funsatNative, sandbox: f.getAttribute("sandbox") || "" })));
    ok(frames.length >= 1 && frames.some((f) => f.native), "the production ad path mounted the native unit as a frame (found " + frames.length + ")");
    ok(frames.every((f) => f.sandbox && !/allow-same-origin/.test(f.sandbox) && !/allow-top-navigation/.test(f.sandbox)), "every ad frame is sandboxed with no same-origin and no top-navigation: " + JSON.stringify(frames.map((f) => f.sandbox)));
    ok(await page.evaluate(() => !document.querySelector('script[src^="data:"]') && !document.querySelector('script[src*="bauval"]')), "no ad network script sits in the page itself");
    ok(await page.evaluate(() => window.__adScriptRanInTopPage === undefined && window.__adReachedTop === undefined), "ad code never ran in, or reached into, the page");
    const home = await homeSlotState(page);
    ok(home && home.state === "shown" && home.height > 100, "the filled native slot appeared at the size its widget reported: " + JSON.stringify(home));

    // ---- clicking things that are not ads
    for (const sel of ["#btnPlan", "#btnSubjectPractice", "#btnCollege", "#btnScholarships", "#btnHome", "#btnAccount"]) {
      const el = await page.$(sel);
      if (el && await el.isVisible()) { await el.click().catch(() => {}); await page.waitForTimeout(250); }
      if (sel === "#btnAccount") await page.evaluate(() => document.getElementById("authModal").classList.remove("show"));
    }
    await page.mouse.click(8, 450); await page.mouse.click(800, 880);
    await page.evaluate(() => document.getElementById("btnHome").click());
    await page.waitForTimeout(400);
    ok(tabs.length === 0, "clicking navigation, dialogs and blank page opened " + tabs.length + " new tab(s)");
    ok(new URL(page.url()).hostname === "funsat.bid", "clicking around never navigated the page away: " + page.url());

    // ---- clicking the ad itself still works
    const adLink = page.frameLocator("iframe[data-funsat-native]").first().locator("#ad-link");
    if (await adLink.count()) {
      const before = tabs.length;
      await adLink.click({ timeout: 4000 }).catch((e) => { fails.push("ad click error: " + String(e.message).split("\n")[0]); });
      await page.waitForTimeout(1500);
      ok(tabs.length === before + 1, "clicking the ad itself still opens its landing page (tabs " + before + " -> " + tabs.length + ")");
      for (const t of tabs.splice(0)) await t.close().catch(() => {});
    } else ok(false, "the stand-in ad's link was not found inside the native frame");

    // ---- no ads while a test runs, is paused, or is full screen
    await page.evaluate(() => { state.cfg.testType = "sat"; state.cfg.section = "math"; state.cfg.total = 6; });
    await page.click("#btnStart");
    await page.waitForSelector("#questionCard .choice");
    await page.waitForTimeout(500);
    ok((await visibleAds(page)).length === 0, "no ad is visible during a test: " + JSON.stringify(await visibleAds(page)));
    await page.evaluate(() => setPaused(true)); await page.waitForTimeout(200);
    ok((await visibleAds(page)).length === 0, "no ad is visible while paused");
    await page.evaluate(() => setPaused(false));
    await page.keyboard.press("f"); await page.waitForTimeout(500);
    ok((await visibleAds(page)).length === 0, "no ad is visible in full screen");
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await page.locator("#questionCard .choice").first().click().catch(() => {});
    await page.waitForTimeout(300);
    ok(tabs.length === 0, "answering questions opened a tab");

    // ---- no ad anywhere in the arcade (its menu is a grid of buttons)
    await page.evaluate(() => { try { finalizeAttempt(true); } catch (e) {} state.view = "start"; render(); });
    await page.evaluate(() => arcade.open());
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => !document.querySelector("#arcadeMenu [data-ad-slot], .cab-grid-b [data-ad-slot], .arcade-sponsor")), "the arcade menu has no ad slot");
    ok((await visibleAds(page)).length === 0, "no ad is visible in the arcade: " + JSON.stringify(await visibleAds(page)));
    await page.evaluate(() => { try { arcade.play(); } catch (e) {} });
    await page.waitForTimeout(500);
    ok((await visibleAds(page)).length === 0, "no ad is visible around an arcade game");
    ok(tabs.length === 0, "the arcade opened a tab");
    ok(!errs.length, "no page errors (hostile network): " + errs.join(" | "));
    await ctx.close();
  }

  // =================== 2) a flirty listing is taken down by the filter that runs inside the frame
  {
    const { ctx, page, errs } = await openApp(browser, "flirty", { width: 1600, height: 900 });
    await page.waitForFunction(() => document.querySelector("[data-ad-slot='home-sidebar']")?.dataset.adState === "blocked", null, { timeout: 15000 }).catch(() => {});
    const st = await page.evaluate(() => { const host = document.querySelector("[data-ad-slot='home-sidebar']"); return { state: host && host.dataset.adState, hidden: !host || host.hidden, frame: !!document.querySelector("iframe[data-funsat-native]") }; });
    ok(st.state === "blocked" && st.hidden && !st.frame, "a flirty native listing is removed and its slot hidden (" + JSON.stringify(st) + ")");
    ok(!errs.length, "no page errors (flirty): " + errs.join(" | "));
    await ctx.close();
  }

  // =================== 3) a unit that never fills takes no space and shows nothing
  {
    const { ctx, page } = await openApp(browser, "empty", { width: 1600, height: 900 });
    await page.waitForTimeout(7000);
    const home = await homeSlotState(page);
    ok(home && home.state !== "shown" && home.height === 0, "an unfilled native slot has no height and is not shown: " + JSON.stringify(home));
    ok(!(await visibleAds(page)).includes("home-sidebar"), "an unfilled slot is not visible");
    await ctx.close();
  }

  // =================== 4) a message from anything but our own frame cannot size or hide anything
  {
    const { ctx, page } = await openApp(browser, "hostile", { width: 1600, height: 900 });
    await page.waitForFunction(() => Number(document.querySelector("iframe[data-funsat-native]")?.dataset.adHeight) > 24, null, { timeout: 10000 }).catch(() => {});
    const h0 = await page.evaluate(() => document.querySelector("iframe[data-funsat-native]")?.style.height);
    await page.evaluate(() => { window.postMessage({ funsatAd: { height: 9999 } }, "*"); window.postMessage({ funsatAd: { unsafe: true } }, "*"); });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.querySelector("iframe[data-funsat-native]")?.style.height);
    ok(after !== undefined && after === h0, "a forged message from the page itself did not resize or remove the ad frame (" + h0 + " -> " + after + ")");
    await ctx.close();
  }

  // =================== 5) a late ad cannot shove a link out from under your cursor (a real generated article page)
  {
    const { ctx, page } = await openApp(browser, "slow", { width: 1280, height: 800 }, "/guides/how-to-write-a-scholarship-essay/");
    await page.waitForSelector("[data-ad-slot='article-top']", { state: "attached" });
    // A link below the in-content slot is the one a reader would be about to click.
    const probe = () => page.evaluate(() => {
      const slot = document.querySelector("[data-ad-slot='article-top']");
      const links = [...document.querySelectorAll("a[href]")].filter((a) => !a.closest("[data-ad-slot]") && (slot.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) && a.getBoundingClientRect().top > 0 && a.getBoundingClientRect().top < innerHeight - 20);
      const a = links[0];
      return a ? { y: Math.round(a.getBoundingClientRect().top + scrollY), href: a.getAttribute("href"), state: slot.dataset.adState || "" } : null;
    });
    const first = await probe();
    ok(!!first, "found a link below the in-content slot to watch");
    // The reader keeps using the page (moving the mouse) for longer than the ad takes to arrive.
    let moved = null;
    for (let i = 0; i < 16; i++) { await page.mouse.move(300 + (i % 4) * 40, 300 + (i % 3) * 30); await page.waitForTimeout(250); const now = await probe(); if (now && first && now.y !== first.y) { moved = now; break; } }
    ok(!moved, "a link moved while the reader was using the page (" + (first && first.y) + " -> " + (moved && moved.y) + "): the late ad pushed content around");
    const during = await page.evaluate(() => document.querySelector("[data-ad-slot='article-top']").dataset.adState);
    ok(during === "ready" || during === "loading", "the filled ad waits while the page is in use (state: " + during + ")");
    // Once the reader pauses, it appears.
    await page.waitForFunction(() => document.querySelector("[data-ad-slot='article-top']").dataset.adState === "shown", null, { timeout: 8000 }).catch(() => {});
    ok(await page.evaluate(() => document.querySelector("[data-ad-slot='article-top']").dataset.adState) === "shown", "the ad appears after the reader pauses");
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.error("FAIL:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log("PASS: ad code runs only in sandboxed frames, no click outside an ad opens a tab or navigates, ads still open when clicked, flirty listings and empty units are removed, a late ad never moves the page under the reader, and nothing shows during tests, pause, full screen or in the arcade.");
})().catch((e) => { console.error(e); process.exit(1); });
