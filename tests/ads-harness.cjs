/* Shared by the ad tests: serves the app under the funsat.bid hostname (so the production ad path runs) and replaces the
 * ad network's scripts with stand-ins, so there is no real ad traffic. Needs the source tree on http://localhost:8899. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const LOCAL = process.env.BASE_URL || "http://localhost:8899";                 // the app, from the source tree
const STATIC = process.env.PAGES_URL || "http://localhost:8898";               // generated pages, from a built public/ directory

// What the stand-in ad network serves, by scenario:
//   hostile  - tries to open a new tab on ANY click it can see, and fills a clickable creative
//   flirty   - fills a listing that fails the family-safe filter
//   empty    - never fills
//   slow     - fills 2.5 seconds after load (to prove a late ad cannot move what you are about to click)
const adScript = (mode) => `(function () {
  if (window === window.top) window.__adScriptRanInTopPage = true;
  try { window.top.__adReachedTop = true; } catch (e) {}
  // A hostile "click anywhere opens a tab" script: it can only see clicks that reach its own document.
  document.addEventListener("click", function () { try { window.open("https://popunder.example/pop", "_blank"); } catch (e) {} }, true);
  function fill() {
    var box = document.querySelector("[id^=container-]") || document.body;
    ${mode === "empty" ? "return;" : ""}
    var a = document.createElement("a");
    a.id = "ad-link"; a.href = "https://example.com/offer";
    a.textContent = ${mode === "flirty" ? '"Meet local singles tonight"' : '"Study smarter with flashcards"'};
    a.style.cssText = "display:block;height:140px;font:16px sans-serif";
    box.appendChild(a);
  }
  var go = function () { ${mode === "slow" ? "setTimeout(fill, 2500)" : "fill()"}; };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();`;

/** Open a page of the site as if it were live. pagePath: "/" (the app, the default) or any path such as "/guides/...". */
async function openApp(browser, mode, viewport, pagePath) {
  const ctx = await browser.newContext({ viewport });
  // The ad network's script URLs are swapped for data: URLs carrying the stand-in script, so no request is needed
  // (sandboxed frames are not always visible to request interception).
  const stubUrl = "data:application/javascript;base64," + Buffer.from(adScript(mode)).toString("base64");
  await ctx.route("https://funsat.bid/**", async (route) => {
    const u = new URL(route.request().url());
    const isApp = !pagePath || pagePath === "/";
    const target = u.pathname === "/" && isApp ? LOCAL + "/" + encodeURIComponent("SAT & ACT Practice.html") : (isApp ? LOCAL : STATIC) + u.pathname + u.search;
    const res = await route.fetch({ url: target });
    if (/text\/html/.test(res.headers()["content-type"] || "")) {
      const body = (await res.text()).replace(/https:\/\/bauval\.org\/\d+\/[0-9a-f]+/g, stubUrl);
      return route.fulfill({ response: res, body, headers: Object.assign({}, res.headers(), { "content-length": undefined }) });
    }
    return route.fulfill({ response: res });
  });
  // Everything else off-site (landing pages, fonts) is cut, so a stray navigation cannot hang a test.
  await ctx.route((url) => !/(^|\.)(funsat\.bid|localhost|127\.0\.0\.1)$/.test(url.hostname), (route) => route.abort());
  const page = await ctx.newPage();
  const tabs = [];
  ctx.on("page", (p) => { if (p !== page) tabs.push(p); });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await page.goto("https://funsat.bid" + (pagePath || "/") + "?nosw", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.FunSatAds);
  return { ctx, page, tabs, errs };
}

// An ad counts as showing only if it is laid out AND is the topmost thing at its own centre (a dialog or the arcade
// covering it means the user is not looking at it). Frames are named after the slot they sit in.
const visibleAds = (page) => page.evaluate(() => [...document.querySelectorAll("[data-ad-slot], iframe[title=Sponsored]")].filter((el) => {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  if (!(r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && !el.closest("[hidden]") && !el.closest(".is-loading"))) return false;
  const top = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + Math.min(r.height / 2, 40)));
  return !!top && (el === top || el.contains(top) || (top.contains(el) && !top.matches("body, html, main, #app, .wrap, section")));
}).map((el) => (el.closest("[data-ad-slot]") || el).dataset.adSlot || "frame"));

module.exports = { chromium, EXEC, LOCAL, STATIC, adScript, openApp, visibleAds };
