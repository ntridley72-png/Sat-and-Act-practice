/* Behavior proof for Neon Racing and Drift Circuit (spec items 1–14). */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const PAGE_PATH = /localhost|127\.0\.0\.1/.test(BASE) ? "/" + encodeURIComponent("SAT & ACT Practice.html") : "/";

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/\/api\/|501|404/.test(m.text())) errors.push("console: " + m.text()); });

  await page.goto(BASE + PAGE_PATH, { waitUntil: "load" });
  await page.waitForSelector("body[data-workspace]");

  // ---- 1. Racing starts, accelerates, advances distance, steers laterally ----
  const racing = await page.evaluate(() => {
    arcade.open(); arcade.select("racing");
    const g = arcade.game; g.started = true;
    const start = { speed: g.speed, distance: g.distance, x: g.playerX };
    arcade._heldKeys.ArrowUp = true;
    for (let i = 0; i < 90; i++) g.update(0.016);
    const afterThrottle = { speed: g.speed, distance: g.distance };
    arcade._heldKeys.ArrowUp = false; arcade._heldKeys.ArrowRight = true;
    const x0 = g.playerX;
    for (let i = 0; i < 45; i++) g.update(0.016);
    const x1 = g.playerX;
    arcade._heldKeys.ArrowRight = false;
    return { start, afterThrottle, x0, x1 };
  });
  if (!(racing.afterThrottle.speed > racing.start.speed)) throw new Error("racing did not accelerate: " + JSON.stringify(racing));
  if (!(racing.afterThrottle.distance > racing.start.distance)) throw new Error("racing did not advance distance");
  if (!(racing.x1 < racing.x0 - 0.05)) throw new Error("screen-right racing steering is reversed: " + JSON.stringify(racing));

  // ---- 2. Braking reduces speed ----
  const braking = await page.evaluate(() => {
    const g = arcade.game; g.speed = 9000;
    arcade._heldKeys.ArrowUp = false; arcade._heldKeys.ArrowDown = true;
    const before = g.speed;
    for (let i = 0; i < 30; i++) g.update(0.016);
    arcade._heldKeys.ArrowDown = false;
    return { before, after: g.speed };
  });
  if (!(braking.after < braking.before)) throw new Error("braking did not reduce speed: " + JSON.stringify(braking));

  // ---- 3. Traffic appears and collisions register without errors ----
  const traffic = await page.evaluate(() => {
    const g = arcade.game; g.reset(); g.started = true; g.playerZ = 4000; g.spawnZ = 4200;
    g.control = (d) => d === "up" ? false : false; // coast while traffic spawns
    for (let i = 0; i < 60; i++) g.update(0.016);
    const count = g.traffic.length;
    // Force a collision: place a car exactly at the player and clear cooldown.
    const lives = g.lives; g.hitCooldown = 0;
    g.traffic.push({ x: g.playerX, z: g.playerZ, speed: 0, paint: "blue", passed: false });
    g.updateTraffic(0.016, g.car(), DriftCircuit.garage());
    return { count, livesBefore: lives, livesAfter: g.lives, flash: g.flash, over: g.over };
  });
  if (traffic.count < 1) throw new Error("no traffic spawned");
  if (!(traffic.livesAfter < traffic.livesBefore) || traffic.flash <= 0) throw new Error("collision did not register: " + JSON.stringify(traffic));

  // A crowded spawn window must still advance instead of trapping updateTraffic in a loop.
  const crowdedSpawn = await page.evaluate(() => {
    const g = arcade.game; g.reset(); g.started = true; g.playerZ = 6000; g.spawnZ = 8000;
    g.traffic = [
      { x: -1, z: 8000, speed: 1000, paint: "blue" },
      { x: 0, z: 8000, speed: 1000, paint: "green" },
    ];
    const before = g.spawnZ;
    g.spawnTraffic(g.car());
    return { before, after: g.spawnZ };
  });
  if (!(crowdedSpawn.after > crowdedSpawn.before)) throw new Error("crowded traffic spawn did not advance: " + JSON.stringify(crowdedSpawn));

  const smoothTraffic = await page.evaluate(() => {
    const g = arcade.game; g.reset(); g.started = true; g.playerZ = 5000; g.spawnZ = 7000;
    g.spawnTraffic(g.car());
    const car = g.traffic[0];
    car.x = 0.65; car.z += 600;
    const before = { x: car.renderX, z: car.renderZ };
    g.update(0.016);
    return { before, physics: { x: car.x, z: car.z }, render: { x: car.renderX, z: car.renderZ }, trim: [car.carKey, car.wheelColor, car.wing, car.decal], steer: g.steerSmoothed };
  });
  if (!(smoothTraffic.render.x > smoothTraffic.before.x && smoothTraffic.render.x < smoothTraffic.physics.x && smoothTraffic.render.z > smoothTraffic.before.z && smoothTraffic.render.z < smoothTraffic.physics.z)) throw new Error("traffic render interpolation failed: " + JSON.stringify(smoothTraffic));
  if (smoothTraffic.trim.some((value) => value == null || value === "")) throw new Error("opponent car detail profile is incomplete: " + JSON.stringify(smoothTraffic));

  // In the WebGL renderer traffic must stay in the depth-tested pass; only the player uses
  // the post-render rear sprite. Otherwise cars hidden by hills are painted over the sky.
  const depthTraffic = await page.evaluate(() => {
    const g = arcade.game; g.reset(); g.started = true; g.playerZ = 18000;
    g.traffic = [{ x: 0, z: 19800, speed: 1800, paint: "blue", carKey: "sport" }];
    const original = g.drawCarRear.bind(g); let rearSprites = 0;
    g.drawCarRear = function () { rearSprites++; return original(...arguments); };
    const gl = RacingGL.available(); g.draw(arcade.ctx); g.drawCarRear = original;
    return { gl, rearSprites };
  });
  if (depthTraffic.gl && depthTraffic.rearSprites !== 1) throw new Error("traffic escaped the depth-tested render pass: " + JSON.stringify(depthTraffic));

  // The highway keeps all physics segments but builds a lighter first-frame visual mesh.
  const meshDensity = await page.evaluate(() => ({ physics: arcade.game.segmentCount, visual: arcade.game.track3d.pts.length, step: arcade.game.track3d.step }));
  if (meshDensity.physics !== 1200 || meshDensity.visual > 450 || meshDensity.step < 2) throw new Error("racing visual mesh was not optimized: " + JSON.stringify(meshDensity));

  // ---- 4. Drift starts and moves under throttle ----
  const driftMove = await page.evaluate(() => {
    arcade.select("drift");
    const g = arcade.game; g.started = true;
    const p0 = { x: g.x, y: g.y };
    arcade._heldKeys.ArrowUp = true;
    for (let i = 0; i < 90; i++) g.update(0.016);
    arcade._heldKeys.ArrowUp = false;
    return { moved: Math.hypot(g.x - p0.x, g.y - p0.y), speed: g.speedNow };
  });
  if (!(driftMove.moved > 10 && driftMove.speed > 30)) throw new Error("drift did not move under throttle: " + JSON.stringify(driftMove));
  const circuitSize = await page.evaluate(() => ({ length: arcade.game.pathLength, width: arcade.game.halfWidth, samples: arcade.game.path.length }));
  if (!(circuitSize.length > 2000 && circuitSize.width >= 40 && circuitSize.samples >= 100)) throw new Error("drift circuit was not enlarged: " + JSON.stringify(circuitSize));

  // ---- 5. Steering changes heading ----
  const heading = await page.evaluate(() => {
    const g = arcade.game; g.reset(); g.started = true; g.vx = 220 * Math.cos(g.a); g.vy = 220 * Math.sin(g.a);
    const a0 = g.a; arcade._heldKeys.ArrowLeft = true;
    for (let i = 0; i < 40; i++) g.update(0.016);
    arcade._heldKeys.ArrowLeft = false;
    return { a0, a1: g.a, delta: Math.abs(Math.atan2(Math.sin(g.a - a0), Math.cos(g.a - a0))) };
  });
  if (!(heading.delta > 0.05)) throw new Error("steering did not change heading: " + JSON.stringify(heading));

  // ---- 6 + 7. Space + steering + speed creates slip AND builds score/combo during the drift ----
  const slip = await page.evaluate(() => {
    const g = arcade.game; g.reset(); g.started = true;
    const p0 = g.path[0]; g.x = p0.x; g.y = p0.y; g.a = Math.atan2(p0.ty, p0.tx);
    g.vx = p0.tx * 330; g.vy = p0.ty * 330;
    const s0 = g.score, c0 = g.combo;
    arcade._heldKeys.ArrowUp = true; arcade._heldKeys.ArrowLeft = true; arcade._heldKeys[" "] = true;
    let bestSlip = 0, bestCombo = 0, driftingFrames = 0;
    for (let i = 0; i < 26; i++) {
      g.update(0.016);
      const cos = Math.cos(g.a), sin = Math.sin(g.a);
      bestSlip = Math.max(bestSlip, Math.abs(-g.vx * sin + g.vy * cos));
      if (g.drifting) { driftingFrames++; bestCombo = Math.max(bestCombo, g.combo); }
    }
    return { lateral: bestSlip, handbrake: g.handbrake, driftingFrames, s0, s1: g.score, c0, c1: bestCombo, onRoad: g.nearestOnPath().lateral < g.halfWidth };
  });
  if (!(slip.lateral > 8)) throw new Error("space did not create lateral slip: " + JSON.stringify(slip));
  if (!slip.handbrake) throw new Error("handbrake flag was not set by space");
  if (slip.driftingFrames < 5) throw new Error("space drift did not register as drifting: " + JSON.stringify(slip));
  if (!(slip.s1 > slip.s0) || !(slip.c1 > slip.c0)) throw new Error("drift did not score or build combo: " + JSON.stringify(slip));

  // ---- 8. Releasing space restores grip (slip decays) ----
  const grip = await page.evaluate(() => {
    const g = arcade.game;
    const slipDuring = g.slip;
    arcade._heldKeys[" "] = false; arcade._heldKeys.ArrowLeft = false; arcade._heldKeys.ArrowUp = true;
    for (let i = 0; i < 60; i++) g.update(0.016);
    return { slipDuring, slipAfter: g.slip };
  });
  if (!(grip.slipAfter < grip.slipDuring * 0.5)) throw new Error("grip did not recover after releasing space: " + JSON.stringify(grip));

  // ---- 9. A valid lap can be recorded (checkpoints in order, forward direction) ----
  const lap = await page.evaluate(() => {
    const g = arcade.game; g.reset(); g.started = true;
    const path = g.path, n = path.length;
    for (const cp of [1, 2, 3, 0]) {
      const idx = g.checkpoints[cp], p = path[idx];
      g.lastPathIndex = idx;
      g.x = p.x; g.y = p.y; g.vx = p.tx * 200; g.vy = p.ty * 200;
      g.checkLap({ i: idx, p, lateral: 0, signed: 0 });
    }
    return { laps: g.laps, score: g.score };
  });
  if (lap.laps !== 1) throw new Error("valid lap was not recorded: " + JSON.stringify(lap));

  // ---- 10. Touch-equivalent controls hold throttle, steering, and drift ----
  const touch = await page.evaluate(() => {
    const press = (sel) => document.querySelector(sel).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
    const release = (sel) => document.querySelector(sel).dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    arcade.select("drift");
    press(".dpad-up"); press(".dpad-left"); press("#btnDriftTouch");
    const held = { up: arcade._heldKeys.ArrowUp, left: arcade._heldKeys.ArrowLeft, drift: arcade._heldKeys[" "] };
    const g = arcade.game; g.started = true;
    for (let i = 0; i < 40; i++) g.update(0.016);
    const moved = g.speedNow;
    release(".dpad-up"); release(".dpad-left"); release("#btnDriftTouch");
    const cleared = { up: arcade._heldKeys.ArrowUp, left: arcade._heldKeys.ArrowLeft, drift: arcade._heldKeys[" "] };
    return { held, moved, cleared };
  });
  if (!touch.held.up || !touch.held.left || !touch.held.drift) throw new Error("touch buttons did not set held controls: " + JSON.stringify(touch));
  if (!(touch.moved > 10)) throw new Error("touch controls did not drive the car");
  if (touch.cleared.up || touch.cleared.left || touch.cleared.drift) throw new Error("touch releases did not clear controls: " + JSON.stringify(touch));

  // ---- Space contract: starts while ready, then acts as handbrake ----
  const spaceContract = await page.evaluate(() => {
    arcade.select("drift");
    const ready = arcade.mode;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    const afterStart = arcade.mode;
    arcade._heldKeys[" "] = true;
    const g = arcade.game; g.started = true;
    for (let i = 0; i < 30; i++) g.update(0.016);
    const hb = g.handbrake;
    arcade._heldKeys[" "] = false;
    return { ready, afterStart, hb };
  });
  if (spaceContract.ready !== "ready" || spaceContract.afterStart !== "playing") throw new Error("space did not start the game: " + JSON.stringify(spaceContract));
  if (!spaceContract.hb) throw new Error("space did not work as the handbrake after start");

  // ---- Inputs stop on blur ----
  const cleared = await page.evaluate(() => { arcade._heldKeys.ArrowUp = true; window.dispatchEvent(new Event("blur")); return arcade._heldKeys.ArrowUp; });
  if (cleared) throw new Error("blur did not clear held inputs");

  // ---- 11. DPR rendering for both games ----
  const dpr = await page.evaluate(() => {
    const report = {};
    ["drift", "racing"].forEach((k) => {
      arcade.select(k);
      const c = arcade.canvas, d = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
      report[k] = { backing: c.width, expected: Math.round(arcade.logicalW * d), smooth: c.style.imageRendering };
    });
    return report;
  });
  ["drift", "racing"].forEach((k) => {
    if (dpr[k].backing !== dpr[k].expected) throw new Error(k + " DPR mismatch: " + JSON.stringify(dpr[k]));
    if (dpr[k].smooth !== "auto") throw new Error(k + " should render smooth, saw " + dpr[k].smooth);
  });

  // ---- 13. Every other arcade game still opens ----
  const all = await page.evaluate(() => {
    const bad = [];
    GAME_LIST.forEach((g) => { try { arcade.select(g.key); if (!arcade.game || arcade.game.key !== g.key) bad.push(g.key); } catch (e) { bad.push(g.key + ":" + e.message); } });
    return bad;
  });
  if (all.length) throw new Error("arcade games failed to open: " + all.join(", "));

  // ---- 14. Racing earnings bank into garage cash exactly once, and both cars expose stopAudio ----
  const banking = await page.evaluate(() => {
    const before = DriftCircuit.garage().cash;
    arcade.select("racing");
    const r = arcade.game; r.started = true; r.earned = 123; r.banked = false;
    const racingHasStop = typeof r.stopAudio === "function";
    arcade.timeUp();
    const afterRacing = DriftCircuit.garage().cash;
    arcade.select("drift");
    const d = arcade.game; d.started = true; d.earned = 77; d.banked = false;
    const driftHasStop = typeof d.stopAudio === "function";
    arcade.timeUp();
    const afterDrift = DriftCircuit.garage().cash;
    arcade.timeUp();
    return { before, afterRacing, afterDrift, final: DriftCircuit.garage().cash, racingHasStop, driftHasStop };
  });
  if (banking.afterRacing !== banking.before + 123) throw new Error("racing earnings were not banked: " + JSON.stringify(banking));
  if (banking.afterDrift !== banking.afterRacing + 77) throw new Error("drift earnings were not banked: " + JSON.stringify(banking));
  if (banking.final !== banking.afterDrift) throw new Error("earnings banked twice: " + JSON.stringify(banking));
  if (!banking.racingHasStop || !banking.driftHasStop) throw new Error("missing stopAudio on a racing class: " + JSON.stringify(banking));

  await browser.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("PASS: racing accelerates/brakes/steers/scores with traffic collisions; drift accelerates, steers, slips with space, scores, recovers grip, laps, and responds to held touch controls; DPR, space contract, blur clearing, garage-cash banking, stopAudio, and all arcade games verified.");
})().catch((error) => { console.error(error); process.exit(1); });
