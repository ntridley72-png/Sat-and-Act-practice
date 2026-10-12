/* The v2 garage: roster, cash paywall, tuning that reaches the solver, and
 * legacy-profile migration, end to end in the browser.
 *
 * The product claim being tested: all six tracks are free from the start,
 * every car after the starter is earned with in-game cash only, tuning moves
 * the real physics the probe reports, and a v1-era garage carries forward
 * instead of resetting. The race seams are driven through the documented
 * window.__rv2economyProbe / window.__rv2probe pattern.
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

function resolveExecutable() {
  if (process.env.PLAYWRIGHT_EXEC) return process.env.PLAYWRIGHT_EXEC;
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (e) { /* fall through */ }
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  for (const d of fs.readdirSync(cache).filter((n) => n.startsWith("chromium-"))) {
    for (const shape of [
      ["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
      ["chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
    ]) {
      const c = path.join(cache, d, ...shape);
      if (fs.existsSync(c)) return c;
    }
  }
  throw new Error("Could not locate Chromium. Install it with: npx playwright install chromium");
}

const ROOT = path.join(__dirname, "..");
const PORT = 8931;
const PAGE = "/" + encodeURIComponent("SAT & ACT Practice.html");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg", ".png": "image/png" };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const file = url.startsWith("/racing-v2/")
        ? path.join(ROOT, "racing-v2", "dist", url.slice("/racing-v2/".length))
        : path.join(ROOT, url === "/" ? "index.html" : url.slice(1));
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: resolveExecutable(),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const fail = (m, got) => { throw new Error(m + ": " + JSON.stringify(got)); };
  const base = `http://127.0.0.1:${PORT}`;

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(base + PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");

  const garage = () => page.evaluate(() => DriftCircuit.garage());
  const openGame = async () => {
    await page.evaluate(() => arcade.select("racing"));
    await page.waitForFunction("window.RacingV2 && RacingV2.appLoaded() === true", { timeout: 20000 });
    await page.waitForSelector(".rv2-go", { state: "visible", timeout: 20000 });
    await page.waitForFunction("window.__rv2economyProbe", { timeout: 20000 });
  };
  // "Back to the arcade" only: .rv2-ghost also matches Tuning's reset button.
  const arcadeBtn = page.locator(".rv2-ghost", { hasText: "arcade" });
  const backToArcade = async () => {
    await arcadeBtn.click();
    await page.waitForFunction(`document.getElementById("racingV2Mount") === null || document.getElementById("racingV2Mount").style.display === "none"`, { timeout: 10000 });
  };
  // Finish the current run through the probe (pay-gated: practice never pays).
  const finishRun = async () => {
    await page.evaluate(() => window.__rv2economyProbe.finish(10, 5));
    await arcadeBtn.waitFor({ state: "visible", timeout: 10000 });
  };
  const startPractice = async () => {
    await page.click(".rv2-go");
    await page.waitForSelector(".rv2-mode", { timeout: 10000 });
    await page.waitForFunction("window.__rv2probe", { timeout: 10000 });
  };
  const carForce = () => page.evaluate(() => window.__rv2probe().car.force);

  // --- 1. the intro is the garage: roster, starter, free tracks ------------
  await openGame();
  const rosterCount = await page.locator(".rv2-car").count();
  const expectedCount = await page.evaluate(() => Object.keys(window.Racing.Cars.CARS).length);
  if (rosterCount !== expectedCount) fail("garage must show every car in the roster", { rosterCount, expectedCount });
  const firstCard = await page.locator(".rv2-car").first();
  if (!/is-on/.test(await firstCard.getAttribute("class"))) fail("the starter car must be selected on a fresh profile");
  if (!(await firstCard.textContent()).includes("Selected")) fail("the starter card must read Selected");
  const cashAtStart = (await garage()).cash;
  if (cashAtStart !== 0) fail("a fresh garage must start at $0", cashAtStart);
  const trackState = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll(".rv2-field"));
    const block = blocks.find((b) => b.querySelector(".rv2-field-label") && b.querySelector(".rv2-field-label").textContent.includes("Track"));
    if (!block) return null;
    const chips = Array.from(block.querySelectorAll(".rv2-chip"));
    return { count: chips.length, disabled: chips.filter((c) => c.disabled).length };
  });
  if (!trackState || trackState.count !== 6) fail("six tracks must be offered", trackState);
  if (trackState.disabled !== 0) fail("tracks must never be paywalled", trackState);
  // Every other car starts locked at $0, with its price on the card.
  const lockedCount = await page.locator(".rv2-car.is-locked").count();
  if (lockedCount !== rosterCount - 1) fail("every non-starter must start locked", { lockedCount, rosterCount });
  const lockedCard = page.locator(".rv2-car.is-locked").first();
  const lockedName = await lockedCard.locator("b").textContent();
  const priceText = await lockedCard.locator("small").textContent();
  const price = Number(priceText.replace(/[^0-9]/g, ""));
  if (!price) fail("a locked card must name its price", priceText);
  if (!(await lockedCard.isDisabled())) fail("a locked card must be disabled while unaffordable");

  // --- 2. buying a car: cash only, persists, and is visible to v1 ----------
  await page.evaluate((p) => { DriftCircuit.garage().cash = p; saveProfile(); updateHUD(); }, price);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await openGame();
  const buyCard = page.locator(".rv2-car", { hasText: lockedName }).first();
  if (await buyCard.isDisabled()) fail("an affordable locked car must be clickable");
  await buyCard.click();
  const cardAfter = await page.locator(".rv2-car", { hasText: lockedName }).first();
  if (!/is-on/.test(await cardAfter.getAttribute("class"))) fail("buying must select the car");
  if (/is-locked/.test(await cardAfter.getAttribute("class"))) fail("buying must unlock the car");
  const afterBuy = await garage();
  if (afterBuy.cash !== 0) fail("buying at exactly the price must leave $0", afterBuy.cash);
  if (afterBuy.raceCar === "sport") fail("buying must switch the race car away from the starter", afterBuy.raceCar);
  // v1 reads the same profile.garage: one garage, two games.
  const v1Sees = await page.evaluate(() => DriftCircuit.garage().raceCar);
  if (v1Sees !== afterBuy.raceCar) fail("v1 must see the car bought in v2", { v1Sees, v2: afterBuy.raceCar });
  // Persistence across a full reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await openGame();
  const afterReload = await garage();
  if (afterReload.cash !== 0 || afterReload.raceCar !== afterBuy.raceCar) fail("the purchase must persist across reloads", afterReload);

  // --- 3. tuning reaches the solver, clamped at both ends ------------------
  // Reselect the starter: case 2 bought a different car, and the shipped
  // 1800-force fixture is sport's.
  await page.locator(".rv2-car").first().click();
  await startPractice();
  const f0 = await carForce();
  if (Math.abs(f0 - 1800) > 1e-6) fail("default sport tune must be the shipped 1800 force", f0);
  await finishRun();
  await backToArcade();
  await openGame();
  await page.evaluate(() => {
    const el = document.getElementById("rv2-tune-power");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "1.2");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const label = await page.textContent("label[for=rv2-tune-power]");
  if (!label.includes("1.20")) fail("moving the power slider must update the label", label);
  await startPractice();
  const f1 = await carForce();
  const expected1 = (1800 * 1.2) / 0.7;
  if (Math.abs(f1 - expected1) > 0.01) fail("power 1.2 must scale engine force", { f1, expected1 });
  await finishRun();
  await backToArcade();
  // A hostile hand-edited profile (bypassing the bridge) must not reach the
  // solver unbounded: carPhysics clamps reads to TUNE_RANGE.
  await page.evaluate(() => { DriftCircuit.garage().tune.power = 99; saveProfile(); });
  await openGame();
  await startPractice();
  const f2 = await carForce();
  if (Math.abs(f2 - 3600) > 0.01) fail("a hostile tune must clamp to the range max", { f2, expected: 3600 });
  await finishRun();
  await backToArcade();
  await openGame();
  await page.evaluate(() => document.querySelector(".rv2-reset") && document.querySelector(".rv2-reset").click());
  await startPractice();
  const f3 = await carForce();
  if (Math.abs(f3 - 1800) > 1e-6) fail("Reset safe setup must restore the shipped tune", f3);
  await finishRun();
  await backToArcade();

  // --- 4. a v1-era garage migrates instead of resetting --------------------
  await page.evaluate(() => { profile.garage = { raceCar: "panda", unlocked: ["sport", "panda"] }; saveProfile(); });
  await openGame();
  const migrated = await garage();
  if (migrated.raceCar !== "hatch") fail("panda must migrate to its launch-record car (hatch)", migrated.raceCar);
  if (migrated.unlocked.indexOf("hatch") === -1) fail("legacy unlocks must migrate forward", migrated.unlocked);
  const v1Migrated = await page.evaluate(() => DriftCircuit.garage().raceCar);
  if (v1Migrated !== "hatch") fail("v1 must see the migrated selection", v1Migrated);

  // --- 5. Space is the handbrake, exactly as v1 -----------------------------
  await startPractice();
  const hbDown = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
    return window.__rv2probe().handbrake;
  });
  if (hbDown !== true) fail("holding Space must read as handbrake", hbDown);
  const hbUp = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true }));
    return window.__rv2probe().handbrake;
  });
  if (hbUp !== false) fail("releasing Space must clear the handbrake", hbUp);

  if (errs.length) fail("page errors during the garage flow", errs.slice(0, 3));
  await page.close();
  await browser.close();
  server.close();
  console.log("PASS: the garage carries the roster and cash paywall (tracks free, cars earned), buys persist and are visible to v1, tuning moves the reported physics and clamps hostile values, legacy garages migrate, and Space is the handbrake.");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
