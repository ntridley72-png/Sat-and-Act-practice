/* Family-safe ad filter: pins predicate accuracy and the async sweep behavior. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  const hasHook = await page.evaluate(() => !!(window.FunSatAds && window.FunSatAds.__test));
  if (!hasHook) throw new Error("FunSatAds.__test hook missing on localhost");

  const pred = await page.evaluate(() => {
    const t = window.FunSatAds.__test;
    const anchor = (text, href) => { const a = document.createElement("a"); a.textContent = text; a.href = href; return a; };
    const img = (alt, src) => { const i = document.createElement("img"); i.alt = alt; i.src = src; return i; };
    return {
      flirtyText: t.elementIsUnsafe(anchor("Meet local singles tonight", "https://example.com")),
      flirtyHref: t.elementIsUnsafe(anchor("Learn more", "https://hookup.example.com/x")),
      updatingHref: t.elementIsUnsafe(anchor("Learn more", "https://cdn.example.com/assets/updating/banner.png")),
      validatingHref: t.elementIsUnsafe(anchor("Learn more", "https://cdn.example.com/validating/")),
      cleanText: t.elementIsUnsafe(anchor("Scholarship application guide", "https://example.com/guides/")),
      cleanImg: t.elementIsUnsafe(img("college students studying", "https://cdn.example.com/study.png")),
      flirtyImg: t.elementIsUnsafe(img("singles nearby", "https://cdn.example.com/a.png")),
      safeLabel: t.creativeIsUnsafe({ label: "Scholarship search", href: "https://example.com", image: "https://cdn.example.com/s.png" }),
      unsafeLabel: t.creativeIsUnsafe({ label: "Flirty chat now", href: "https://example.com" }),
      unsafeImage: t.creativeIsUnsafe({ label: "Study tools", href: "https://example.com", image: "https://dating.example.com/x.png" }),
    };
  });

  const expect = (name, got, want) => { if (got !== want) throw new Error(name + " expected " + want + " got " + got); };
  expect("flirtyText", pred.flirtyText, true);
  expect("flirtyHref", pred.flirtyHref, true);
  expect("updatingHref (no false positive)", pred.updatingHref, false);
  expect("validatingHref (no false positive)", pred.validatingHref, false);
  expect("cleanText", pred.cleanText, false);
  expect("cleanImg", pred.cleanImg, false);
  expect("flirtyImg", pred.flirtyImg, true);
  expect("safeLabel", pred.safeLabel, false);
  expect("unsafeLabel", pred.unsafeLabel, true);
  expect("unsafeImage", pred.unsafeImage, true);

  // Async behavior: the widget fills late, so a listing injected after the first
  // sweep must still be caught, and the slot must end up hidden.
  const asyncResult = await page.evaluate(async () => {
    const t = window.FunSatAds.__test;
    const host = document.createElement("aside");
    host.setAttribute("data-ad-slot", "test-slot");
    host.className = "sponsor-slot";
    const container = document.createElement("div");
    container.id = "container-test-unit";
    host.appendChild(container);
    document.body.appendChild(host);
    t.watchForUnsafeListings(host);
    await new Promise((r) => setTimeout(r, 200));
    const a = document.createElement("a");
    a.textContent = "Hot singles in your area";
    a.href = "https://example.com";
    container.appendChild(a);
    await new Promise((r) => setTimeout(r, 2400));
    return { hidden: host.hidden, cleared: container.childElementCount === 0 };
  });
  if (!asyncResult.hidden) throw new Error("late-arriving unsafe listing did not hide the slot");
  if (!asyncResult.cleared) throw new Error("unsafe listing was not cleared from the container");

  if (errors.length) throw new Error(errors[0]);
  console.log("PASS: family-safe ad filter blocks flirty listings (late ones too), avoids 'updating' false positives, and hides the slot.");
  await browser.close();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
