const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.DirtBike && typeof arcade !== "undefined");

  const result = await page.evaluate(() => {
    arcade.open();
    arcade.select("dirtbike");
    const game = arcade.game;
    const start = { x: game.x, score: game.score, terrain: game.terrain.length };
    arcade.play();
    arcade._heldKeys.ArrowUp = true;
    for (let i = 0; i < 180; i++) game.update(0.016);
    arcade._heldKeys.ArrowUp = false;
    const moved = game.x - start.x;
    const score = game.score;
    const throttleFeedback = { speed: game.vx, pitch: game.cameraPitch, parallax: game.speedFx, wheelSpin: game.wheelSpin, input: game.throttleInput, renderGap: Math.abs(game.x - game.renderX) };
    arcade._heldKeys.ArrowUp = false; arcade._heldKeys.ArrowRight = true;
    for (let i = 0; i < 24; i++) game.update(0.016);
    const steerFeedback = { camera: game.cameraLean, input: game.leanInput, pose: game.renderAngle };
    arcade._heldKeys.ArrowRight = false; arcade._heldKeys.ArrowDown = true;
    for (let i = 0; i < 24; i++) game.update(0.016);
    const brakeFeedback = game.cameraPitch;
    arcade._heldKeys.ArrowDown = false;
    const galleryAdDuringPlay = document.querySelector(".arcade-sponsor") && !document.querySelector(".arcade-sponsor").hidden && arcade.stage.contains(document.querySelector(".arcade-sponsor"));
    return { key: game.key, moved, score, terrain: start.terrain, throttleFeedback, steerFeedback, brakeFeedback, galleryAdDuringPlay };
  });

  if (result.key !== "dirtbike") throw new Error("dirt-bike game did not load");
  if (result.terrain < 300) throw new Error("dirt-bike terrain is too short");
  if (result.moved < 400 || result.score <= 0 || result.throttleFeedback.speed < 300) throw new Error("dirt-bike throttle/score is still too slow: " + JSON.stringify(result));
  if (!(result.throttleFeedback.pitch < -0.2 && result.throttleFeedback.parallax > 0.35 && result.throttleFeedback.wheelSpin > 0)) throw new Error("dirt-bike throttle did not affect the camera/background: " + JSON.stringify(result));
  if (!(result.throttleFeedback.input > 0.9 && Number.isFinite(result.throttleFeedback.renderGap))) throw new Error("dirt-bike throttle/render smoothing failed: " + JSON.stringify(result));
  if (!(result.steerFeedback.camera < -0.01 && result.steerFeedback.input > 0.8 && Number.isFinite(result.steerFeedback.pose) && result.brakeFeedback > result.throttleFeedback.pitch)) throw new Error("dirt-bike steering/braking feedback failed: " + JSON.stringify(result));
  if (result.galleryAdDuringPlay) throw new Error("arcade sponsor was placed over the active game stage");
  fs.mkdirSync(path.join(__dirname, "screenshots"), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, "screenshots", "arcade-dirtbike.png"), fullPage: false });
  const checkpoint = await page.evaluate(() => { arcade.game.x = 1801; arcade.game.update(0.016); return arcade.game.checkpoint; });
  if (checkpoint < 1) throw new Error("dirt-bike checkpoint failed");
  if (errors.length) throw new Error(errors.join("\n"));
  await browser.close();
  console.log("PASS: dirt-bike speed, terrain, input-reactive camera/background, movement, scoring, checkpoint, and non-interruptive arcade ad placement work.");
})().catch((error) => { console.error(error); process.exit(1); });
