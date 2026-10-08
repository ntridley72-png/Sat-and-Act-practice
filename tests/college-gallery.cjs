/* College photo gallery + lightbox on the generated /colleges/<slug>/ pages.
   Checks the grid at 1/2/3 columns, the 1-image, 6-image and no-image cases,
   per-image attribution, and the lightbox keyboard contract.
   Needs a server for the generated pages: PAGES_URL=http://localhost:8898   */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.PAGES_URL || "http://localhost:8898";
const MANY = "/colleges/harvard-university/";
const ONE = "/colleges/anna-maria-college/";
const NONE = "/colleges/beacon-college/";
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axnLlcAAAAASUVORK5CYII=", "base64");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  // Offline: the Commons URLs are stubbed so layout is measured, not the network.
  await ctx.route("**://*.wikimedia.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  const page = await ctx.newPage();

  const cols = () => page.evaluate(() => {
    const g = document.querySelector(".cg-grid");
    return g ? getComputedStyle(g).gridTemplateColumns.split(" ").length : 0;
  });

  // ---- three images: 3 / 2 / 1 columns by width, 16:9, no reflow reserve missing
  await page.goto(BASE + MANY, { waitUntil: "load" });
  const many = await page.locator(".cg-item").count();
  ok(many >= 3, "expected a multi-photo gallery, got " + many);
  ok(await page.locator(".cg-credit").count() === many, "every photo needs its own credit, not just the first");
  const shaped = await page.evaluate(() => Array.from(document.querySelectorAll(".cg-item img")).map((im) => ({
    ratio: Math.round((im.clientWidth / im.clientHeight) * 100) / 100,
    fit: getComputedStyle(im).objectFit, lazy: im.getAttribute("loading"),
    w: im.getAttribute("width"), h: im.getAttribute("height"),
    radius: getComputedStyle(im.closest(".cg-open")).borderTopLeftRadius,
  })));
  ok(shaped.every((s) => Math.abs(s.ratio - 16 / 9) < 0.03), "thumbnails must be 16:9: " + JSON.stringify(shaped.map((s) => s.ratio)));
  ok(shaped.every((s) => s.fit === "cover"), "thumbnails must use object-fit:cover");
  ok(shaped.every((s) => s.lazy === "lazy" && s.w && s.h), "thumbnails must be lazy with width and height set");
  ok(shaped.every((s) => s.radius === "14px"), "thumbnails must be rounded to --fx-r-md: " + JSON.stringify(shaped.map((s) => s.radius)));
  ok(await cols() === 3, "3 columns above 900px");
  await page.setViewportSize({ width: 820, height: 900 });
  ok(await cols() === 2, "2 columns under 900px");
  await page.setViewportSize({ width: 420, height: 900 });
  ok(await cols() === 1, "1 column under 560px");
  await page.setViewportSize({ width: 1200, height: 900 });

  // ---- lightbox: open, arrows, escape, focus return
  await page.locator('.cg-open[data-cg="1"]').click();
  await page.waitForSelector(".cg-lb:not([hidden])");
  ok(await page.textContent(".cg-lb-count") === "2 of " + many, "lightbox should open on the clicked photo");
  ok((await page.textContent(".cg-lb-credit")).trim().length > 0, "lightbox needs a visible credit");
  await page.keyboard.press("ArrowRight");
  ok(await page.textContent(".cg-lb-count") === "3 of " + many, "right arrow should advance");
  for (let i = 3; i < many; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  ok(await page.textContent(".cg-lb-count") === "1 of " + many, "right arrow should wrap round");
  await page.keyboard.press("ArrowLeft");
  ok(await page.textContent(".cg-lb-count") === many + " of " + many, "left arrow should go back");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector(".cg-lb").hidden);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-cg"));
  ok(focused === String(many - 1), "focus must return to the thumbnail the viewer landed on, got " + focused);

  // ---- one image: a single column, never stretched across three
  await page.goto(BASE + ONE, { waitUntil: "load" });
  ok(await page.locator(".cg-item").count() === 1, "expected a 1-photo gallery");
  ok(await cols() === 1, "a single photo stays in one column at 1200px");
  const lone = await page.evaluate(() => {
    const im = document.querySelector(".cg-item img");
    return { w: im.clientWidth, ratio: Math.round((im.clientWidth / im.clientHeight) * 100) / 100 };
  });
  ok(lone.w <= 640, "a single photo must not run the full page width: " + lone.w);
  ok(Math.abs(lone.ratio - 16 / 9) < 0.03, "a single photo keeps 16:9");
  await page.locator(".cg-open").click();
  await page.waitForSelector(".cg-lb:not([hidden])");
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".cg-lb-next")).display) === "none",
     "with one photo the next/prev arrows should not be offered");
  await page.keyboard.press("Escape");

  // ---- six images: still equal tracks, three per row, each credited
  await page.goto(BASE + MANY, { waitUntil: "load" });
  await page.evaluate(() => {
    const section = document.querySelector("[data-college-gallery]");
    const grid = section.querySelector(".cg-grid");
    const data = JSON.parse(section.querySelector(".cg-data").textContent);
    const first = grid.children[0];
    for (let i = grid.children.length; i < 6; i++) {
      const clone = first.cloneNode(true);
      clone.querySelector(".cg-open").dataset.cg = String(i);
      clone.querySelector(".cg-credit").textContent = "Photographer " + (i + 1);
      grid.appendChild(clone);
      data.push({ src: data[0].src, credit: "Photographer " + (i + 1), license: "" });
    }
    section.dataset.count = "6";
    section.querySelector(".cg-data").textContent = JSON.stringify(data);
  });
  ok(await page.locator(".cg-item").count() === 6, "six items");
  ok(await cols() === 3, "six photos lay out three per row");
  const six = await page.evaluate(() => Array.from(document.querySelectorAll(".cg-item")).map((f) => Math.round(f.getBoundingClientRect().width)));
  ok(new Set(six).size === 1, "six photos must sit on equal tracks: " + JSON.stringify(six));
  ok(await page.locator(".cg-credit").count() === 6, "all six need credits");
  await page.locator('.cg-open[data-cg="5"]').click();
  await page.waitForSelector(".cg-lb:not([hidden])");
  ok(/6 of 6/.test(await page.textContent(".cg-lb-count")), "lightbox counts all six");
  await page.keyboard.press("Escape");

  // ---- no images: no empty grid and no reserved space
  await page.goto(BASE + NONE, { waitUntil: "load" });
  ok(await page.locator(".cg").count() === 0, "a college with no photos must not render an empty grid");
  ok(await page.locator("script[src='/college-gallery.js']").count() === 0, "no gallery, no gallery script");
  const gap = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    let el = h1.nextElementSibling, blanks = 0;
    while (el) { const r = el.getBoundingClientRect();
      const inert = el.hidden || el.tagName === "SCRIPT" || getComputedStyle(el).display === "none";
      if (r.height === 0 && !inert) blanks++; el = el.nextElementSibling; }
    return blanks;
  });
  ok(gap === 0, "no zero-height placeholder blocks left behind: " + gap);

  await browser.close();
  fails.forEach((f) => console.log("FAIL " + f));
  console.log(fails.length ? `\nRESULT: ${fails.length} failure(s)` : "PASS: college gallery grid, attribution, lightbox keyboard contract, and the 1 / 6 / none cases all behave.");
  process.exit(fails.length ? 1 : 0);
})();
