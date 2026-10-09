/* Workshop track previews and performance bars.
   TASK 2: every track draws a distinct layout preview, updates immediately on
   selection, and selecting a track never starts a race.
   TASK 3: the bars are resolved from the shared racing stack (racing/data/cars.js
   + racing/core/vehicle-physics.js) scaled by the garage tune; they update live
   with tune and handling moves, ignore cosmetic parts, and carry meter semantics. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");

  // Load the shared racing stack first, so the bars resolve from the same data
  // and physics module the simulation runs on.
  await page.evaluate(() => window.RacingV2.load());
  const loaded = await page.evaluate(() => !!(window.Racing && Racing.Cars && Racing.Physics && Racing.Cars.CARS.sport));
  ok(loaded, "the shared racing stack (cars + physics) must be loadable");

  await page.evaluate(() => arcade.open());
  await page.waitForSelector("#arcadeOverlay.show");
  await page.click("#cabGarageBtn");
  await page.waitForSelector("#driftGarage.show");

  // ---- TASK 2: track previews
  await page.click('#dgBody .workshop-panel [data-tab="tracks"]');
  await page.waitForSelector("#dgBody .workshop-trackmap");

  const readPreview = () => page.evaluate(() => {
    const fig = document.querySelector("#dgBody .workshop-trackmap");
    const road = fig.querySelector("path.tm-road");
    return { key: fig.dataset.trackmap, name: fig.dataset.trackName, d: road && road.getAttribute("d") };
  });
  const keys = await page.evaluate(() => Object.keys(DriftCircuit.TRACKS));
  const paths = {};
  for (const key of keys) {
    await page.click(`#dgBody [data-track="${key}"]`);
    const view = await readPreview();
    ok(view.key === key, "the preview must follow the selected track: " + key);
    ok(view.d && view.d.indexOf("M") === 0 && view.d.length > 120, "the preview must draw a sampled closed path for " + key);
    paths[key] = view.d;
  }
  ok(new Set(Object.values(paths)).size === keys.length, "every track needs a distinct layout preview");
  ok(paths.lot.indexOf("lot") < 0, "sanity: paths are geometry, not names");

  const idle = await page.evaluate(() => ({ started: !!(arcade.game && arcade.game.started), overlay: !!document.querySelector("#arcadeOverlay.show") }));
  ok(!idle.started, "selecting a track must not start a race");
  const aria = await page.evaluate(() => {
    const svg = document.querySelector("#dgBody .workshop-trackmap svg");
    return { role: svg.getAttribute("role"), label: svg.getAttribute("aria-label") };
  });
  ok(aria.role === "img" && /Layout preview/.test(aria.label), "the preview needs an accessible label");

  // Direction marker and theme palette.
  await page.click("#dgBody .workshop-panel [data-tab=\"tracks\"]");
  const marker = await page.evaluate(() => {
    const fig = document.querySelector("#dgBody .workshop-trackmap");
    const arrow = fig.querySelector("path.tm-arrow");
    return {
      d: arrow && arrow.getAttribute("d"),
      transform: arrow && arrow.getAttribute("transform"),
      road: getComputedStyle(fig.querySelector(".tm-road")).stroke,
    };
  });
  ok(marker.d && /^M 0 -7/.test(marker.d) && /rotate\(-?\d/.test(marker.transform), "the preview needs a start arrow pointing along the lap");
  await page.click('#dgBody [data-theme="desert"]');
  const themed = await page.evaluate(() => {
    const fig = document.querySelector("#dgBody .workshop-trackmap");
    return {
      style: fig.getAttribute("style") || "",
      road: getComputedStyle(fig.querySelector(".tm-road")).stroke,
      caption: fig.querySelector("figcaption span").textContent,
    };
  });
  ok(/--tm-road:/.test(themed.style), "the preview must take its palette from the selected theme");
  ok(/Desert canyon/.test(themed.caption), "the caption should name the active theme");
  ok(themed.road !== marker.road, "switching themes must repaint the preview road");

  // Every car renders a distinct silhouette: hash each canvas.
  const hashes = await page.evaluate(() => {
    const ids = Object.keys(DriftCircuit.CARS);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(host);
    const out = {};
    ids.forEach((id) => {
      const cv = document.createElement("canvas");
      cv.style.width = "320px";
      cv.style.height = "150px";
      host.appendChild(cv);
      FunSATWorkshop.drawCar(cv, DriftCircuit.CARS[id], "#07869a", -0.25, null);
      out[id] = cv.toDataURL();
    });
    host.remove();
    return out;
  });
  const carIds = Object.keys(hashes);
  ok(carIds.length >= 15, "expected the full fleet, got " + carIds.length);
  ok(new Set(Object.values(hashes)).size === carIds.length,
     "all " + carIds.length + " car canvases must render differently: " + carIds.join(","));

  // ---- TASK 3: performance bars
  const readBars = () => page.evaluate(() => {
    const box = document.querySelector("#dgBody .workshop-bars");
    const spans = Array.from(box.querySelectorAll(":scope > span"));
    const meters = Array.from(box.querySelectorAll(":scope > i"));
    const values = Array.from(box.querySelectorAll(":scope > b"));
    return spans.map((s, i) => ({
      label: s.textContent,
      value: parseFloat(values[i].textContent),
      text: values[i].textContent,
      role: meters[i].getAttribute("role"),
      aria: parseFloat(meters[i].getAttribute("aria-valuenow")),
    }));
  });

  const base = await readBars();
  ok(base.length === 4 && base.map((b) => b.label).join(",") === "Speed,Grip,Drift,Handling",
     "expected the four performance bars: " + JSON.stringify(base.map((b) => b.label)));
  ok(base.every((b) => /^\d+\.\d$/.test(b.text)), "bars show one decimal: " + JSON.stringify(base.map((b) => b.text)));
  ok(base.every((b) => b.role === "meter" && Math.abs(b.aria - b.value) < 0.051),
     "bars expose meter semantics: " + JSON.stringify(base.map((b) => [b.role, b.aria, b.value])));
  const before = await page.evaluate(() => FunSATWorkshop.performance());

  // Tune power up and grip down: the resolved physics values move by exactly
  // the multipliers vehicle-physics.js applies.
  await page.click('#dgBody .workshop-panel [data-tab="tune"]');
  const setSlider = (sel, value) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v; el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [sel, value]);
  await setSlider('#dgBody [data-tune="power"]', "1.4");
  await setSlider('#dgBody [data-tune="grip"]', "0.7");
  const after = await page.evaluate(() => FunSATWorkshop.performance());
  ok(Math.abs(after.speed / before.speed - 2) < 0.001, "speed must resolve with the tune power multiplier: " + after.speed / before.speed);
  ok(Math.abs(after.grip / before.grip - (0.7 / 1.35)) < 0.001, "grip must resolve with the tune grip multiplier: " + after.grip / before.grip);
  const tuned = await readBars();
  const bar = (list, label) => list.find((b) => b.label === label);
  ok(bar(tuned, "Speed").value > bar(base, "Speed").value, "raising power must raise the Speed bar");
  ok(bar(tuned, "Grip").value < bar(base, "Grip").value, "lowering grip must lower the Grip bar");
  ok(tuned.every((b) => Math.abs(b.aria - b.value) < 0.051), "live-updated bars keep meter semantics");

  // Handling model: Sim holds slides (more drift gain) and straightens slower.
  const driftBefore = bar(tuned, "Drift").value, handlingBefore = bar(tuned, "Handling").value;
  await setSlider('#dgBody [data-handling]', "0.9");
  const handled = await readBars();
  ok(bar(handled, "Drift").value > driftBefore, "moving to the Sim handling model must raise the Drift bar");
  ok(bar(handled, "Handling").value < handlingBefore, "Sim straightens slower, so the Handling bar must fall");
  const afterHandling = await page.evaluate(() => FunSATWorkshop.performance());
  ok(Math.abs(afterHandling.grip - after.grip) < 1e-9, "the handling model must not change resolved grip");

  // Cosmetic parts must never move the bars.
  const beforeCosmetic = await readBars();
  await page.click('#dgBody .workshop-panel [data-tab="custom"]');
  await page.click('#dgBody [data-paint="blue"]');
  await page.click('#dgBody .workshop-panel [data-tab="custom"]');
  await page.click('#dgBody [data-wheels="mesh"]');
  await page.click('#dgBody .workshop-panel [data-tab="custom"]');
  await page.click('#dgBody [data-decal="stripes"]');
  const afterCosmetic = await readBars();
  ok(JSON.stringify(afterCosmetic) === JSON.stringify(beforeCosmetic), "paint, wheels and decals must not move the bars");

  // A different car resolves different physics, so the bars must change.
  await page.evaluate(() => { DriftCircuit.garage().cash = 5000; saveProfile(); FunSATWorkshop.render(); });
  await page.click('#dgBody .workshop-panel [data-tab="cars"]');
  await page.click('#dgBody [data-buy="muscle"]');
  const swapped = await readBars();
  ok(JSON.stringify(swapped) !== JSON.stringify(afterCosmetic), "switching cars must recompute the bars");
  const muscle = await page.evaluate(() => FunSATWorkshop.performance());
  ok(muscle.speed > before.speed, "the muscle car's torque-to-weight must resolve above the starter coupe's");

  ok(errors.length === 0, "no page errors: " + errors.join(" | "));

  await browser.close();
  fails.forEach((f) => console.log("FAIL " + f));
  console.log(fails.length ? `\nRESULT: ${fails.length} failure(s)` : "PASS: track previews are distinct and immediate, and the performance bars follow the resolved physics through tune, handling, and car changes while ignoring cosmetics.");
  process.exit(fails.length ? 1 : 0);
})();
