/* Scholarship detail pane: 16:9 header image with dimensions set, the
   category-tinted initials panel when a program has no photo, one primary
   action sized to its label with the star at matching height, a ghost back
   control, and the description sitting under the sponsor name. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = "/" + encodeURIComponent("SAT & ACT Practice.html");
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axnLlcAAAAASUVORK5CYII=", "base64");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

async function openDetail(browser, { stripImage, width }) {
  const ctx = await browser.newContext({ viewport: { width: width || 1280, height: 950 } });
  await ctx.route("**://*.wikimedia.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  if (stripImage) {
    // The dataset currently has a photo for every program, so the fallback is
    // exercised by removing one before the screen renders.
    await page.addInitScript(() => {
      Object.defineProperty(window, "SCHOLARSHIP_DATA", {
        configurable: true,
        set(v) { (v.scholarships || []).forEach((s) => { delete s.img; }); this._d = v; },
        get() { return this._d; },
      });
    });
  }
  await page.goto(BASE + APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.evaluate(() => { try { arcade.close(); } catch (e) {} });
  await page.click("#btnScholarships");
  await page.waitForSelector("#screen-scholarships", { state: "visible" });
  await page.locator(".schl-card").first().click();
  await page.waitForTimeout(350);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

  // ---- with a photo
  let { ctx, page } = await openDetail(browser, {});
  const withImg = await page.evaluate(() => {
    const fig = document.querySelector(".schl-hero img");
    const official = document.querySelector(".schl-official");
    const star = document.querySelector(".schl-star");
    const head = document.querySelector(".schl-detail-head");
    const tile = document.querySelector(".schl-tile");
    return {
      hasImg: !!fig,
      ratio: fig ? Math.round((fig.clientWidth / fig.clientHeight) * 100) / 100 : 0,
      fit: fig ? getComputedStyle(fig).objectFit : "",
      lazy: fig ? fig.getAttribute("loading") : "",
      dims: fig ? !!(fig.getAttribute("width") && fig.getAttribute("height")) : false,
      radius: fig ? getComputedStyle(fig).borderTopLeftRadius : "",
      credit: (document.querySelector(".schl-hero-credit") || {}).textContent || "",
      officialW: official ? Math.round(official.getBoundingClientRect().width) : 0,
      paneW: Math.round(document.querySelector(".schl-detail").clientWidth),
      officialH: official ? Math.round(official.getBoundingClientRect().height) : 0,
      starH: star ? Math.round(star.getBoundingClientRect().height) : 0,
      // the description must come before the eligibility/steps sections
      descInHead: !!head.querySelector(".schl-detail-desc"),
      descAfterOrg: head.querySelector(".schl-detail-org") && head.querySelector(".schl-detail-org").nextElementSibling === head.querySelector(".schl-detail-desc"),
      tileH: tile ? Math.round(tile.getBoundingClientRect().height) : 0,
      tileText: tile ? Math.round(tile.scrollHeight) : 0,
    };
  });
  ok(withImg.hasImg, "a program with a photo needs a header image");
  ok(Math.abs(withImg.ratio - 16 / 9) < 0.04, "header image must be 16:9, got " + withImg.ratio);
  ok(withImg.fit === "cover", "header image must use object-fit:cover");
  ok(withImg.lazy === "lazy" && withImg.dims, "header image must be lazy with width and height set");
  ok(withImg.radius === "14px", "header image rounding should match --fx-r-md, got " + withImg.radius);
  ok(withImg.credit.trim().length > 0, "header image needs its credit");
  ok(withImg.officialW < withImg.paneW * 0.75, `"Official page" should be sized to its label, not the pane (${withImg.officialW} of ${withImg.paneW})`);
  ok(withImg.officialH === withImg.starH, `the primary action and the star should match height (${withImg.officialH} vs ${withImg.starH})`);
  ok(withImg.descInHead && withImg.descAfterOrg, "the description belongs directly under the sponsor name");
  ok(withImg.tileH <= withImg.tileText + 2, `stat tiles should not be taller than their content (${withImg.tileH} vs ${withImg.tileText})`);

  // one primary action on the pane: the star and back control are not accent fills
  const accentCount = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;left:-9999px;background-color:var(--fx-accent)";
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return Array.from(document.querySelectorAll(".schl-detail *")).filter((el) => el.offsetParent &&
      getComputedStyle(el).backgroundColor === accent).map((el) => el.className);
  });
  ok(accentCount.length <= 1, "only one accent-filled control on the detail pane: " + JSON.stringify(accentCount));
  await ctx.close();

  // ---- the back control is a ghost at the width where it appears
  ({ ctx, page } = await openDetail(browser, { width: 420 }));
  const back = await page.evaluate(() => {
    const b = document.querySelector(".schl-detail-back");
    if (!b || !b.offsetParent) return null;
    const cs = getComputedStyle(b);
    return { bg: cs.backgroundColor, border: cs.borderTopWidth, h: Math.round(b.getBoundingClientRect().height) };
  });
  ok(back, "the back control should be offered on a narrow viewport");
  if (back) {
    ok(/rgba\(0, 0, 0, 0\)|transparent/.test(back.bg), "back must be a ghost, not a filled block: " + back.bg);
    ok(back.border === "0px", "back must not carry a border");
    ok(back.h >= 44, "back still needs a 44px touch target, got " + back.h);
  }
  await ctx.close();

  // ---- without a photo: the tinted initials panel, never an empty box
  ({ ctx, page } = await openDetail(browser, { stripImage: true }));
  const fallback = await page.evaluate(() => {
    const el = document.querySelector(".schl-hero-fallback");
    if (!el) return null;
    const cs = getComputedStyle(el);
    const pane = getComputedStyle(document.querySelector(".schl-detail"));
    return {
      img: !!document.querySelector(".schl-hero img"),
      ratio: Math.round((el.clientWidth / el.clientHeight) * 100) / 100,
      bg: cs.backgroundColor, paneBg: pane.backgroundColor,
      initials: (el.textContent || "").trim(),
      role: el.getAttribute("role"), label: el.getAttribute("aria-label"),
      tint: el.getAttribute("data-tint"),
    };
  });
  ok(fallback, "a program with no photo must still get a header panel");
  if (fallback) {
    ok(!fallback.img, "the fallback must not render an img element");
    ok(Math.abs(fallback.ratio - 16 / 9) < 0.04, "the fallback keeps 16:9, got " + fallback.ratio);
    ok(fallback.bg !== fallback.paneBg, "the fallback must be tinted, not an invisible box");
    ok(/^[A-Z0-9]{1,2}$/.test(fallback.initials), "the fallback shows the sponsor's initials, got " + JSON.stringify(fallback.initials));
    ok(fallback.role === "img" && fallback.label, "the fallback needs an accessible name");
  }
  await ctx.close();

  await browser.close();
  fails.forEach((f) => console.log("FAIL " + f));
  console.log(fails.length ? `\nRESULT: ${fails.length} failure(s)` : "PASS: scholarship detail pane header image, tinted fallback, action sizing, ghost back, and description placement all behave.");
  process.exit(fails.length ? 1 : 0);
})();
