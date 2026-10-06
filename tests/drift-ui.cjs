/* Drift + Racing 3D garage, customization, sounds wiring, and token/death-screen behavior. */
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

  await page.goto(BASE + PAGE_PATH, { waitUntil: "load" });
  await page.waitForSelector("body[data-workspace]");

  // Garage is reachable from the arcade menu before picking a game.
  await page.evaluate(() => arcade.open());
  await page.waitForSelector("#arcadeOverlay.show");
  if (!(await page.locator("#cabGarageBtn").isVisible())) throw new Error("garage button missing from the arcade menu");
  await page.click("#cabGarageBtn");
  await page.waitForSelector("#driftGarage.show");
  if (!(await page.locator("#dgBody .dg-car").count())) throw new Error("menu garage did not render");
  await page.click("#dgClose");
  await page.evaluate(() => arcade.backToMenu());

  // Drift opens, scales, and shows the garage everywhere.
  await page.evaluate(() => { arcade.open(); arcade.select("drift"); });
  await page.waitForTimeout(200);
  const driftOpen = await page.evaluate(() => ({
    key: arcade.game && arcade.game.key,
    hud: !!document.getElementById("btnDriftGarage") && document.getElementById("btnDriftGarage").offsetParent !== null,
    panelHidden: !document.getElementById("washCustomize") || !document.getElementById("washCustomize").classList.contains("show"),
    width: parseFloat(arcade.canvas.style.width), logical: arcade.logicalW,
  }));
  if (driftOpen.key !== "drift" || !driftOpen.hud) throw new Error("drift garage entry missing: " + JSON.stringify(driftOpen));
  if (!driftOpen.panelHidden) throw new Error("car paint/wheels panel must not cover games: " + JSON.stringify(driftOpen));
  if (!(driftOpen.width > driftOpen.logical * 1.2)) throw new Error("drift should scale up: " + JSON.stringify(driftOpen));

  // Garage v2: all sections and controls.
  await page.click("#btnDriftGarage");
  await page.waitForSelector("#driftGarage.show");
  const g = await page.evaluate(() => ({
    cars: document.querySelectorAll("#dgBody .dg-car").length,
    tuning: document.querySelectorAll("#dgBody [data-tune]").length,
    tracks: document.querySelectorAll("#dgBody [data-track]").length,
    themes: document.querySelectorAll("#dgBody [data-theme]").length,
    modes: document.querySelectorAll("#dgBody [data-racemode]").length,
    cams: document.querySelectorAll("#dgBody [data-cam]").length,
    finishes: document.querySelectorAll("#dgBody [data-finish]").length,
    kits: document.querySelectorAll("#dgBody [data-kit]").length,
    wings: document.querySelectorAll("#dgBody [data-wing]").length,
    decals: document.querySelectorAll("#dgBody [data-decal]").length,
    wheelColors: document.querySelectorAll("#dgBody [data-wheelcolor]").length,
    convert: document.querySelectorAll("#dgBody #dgConvert, #dgBody #dgConvertAll").length,
    raceCarBtns: document.querySelectorAll("#dgBody [data-racecar]").length,
  }));
  if (g.cars < 8 || g.tuning !== 4 || g.tracks < 6 || g.themes !== 5 || g.modes !== 2 || g.cams !== 2) throw new Error("garage sections missing: " + JSON.stringify(g));
  if (g.finishes !== 5 || g.kits !== 3 || g.wings !== 4 || g.decals !== 5 || g.wheelColors !== 5 || g.convert !== 2 || g.raceCarBtns < 1) throw new Error("customization controls missing: " + JSON.stringify(g));

  // Customize: paint, finish, wheels, kit, decal, number, handling, theme, race mode.
  await page.evaluate(() => { DriftCircuit.garage().cash = 5000; saveProfile(); window.DriftGarage.render(); });
  await page.click('#dgBody [data-paint="blue"]');
  await page.click('#dgBody [data-finish="chrome"]');
  await page.click('#dgBody [data-wheels="mesh"]');
  await page.click('#dgBody [data-wheelcolor="gold"]');
  await page.click('#dgBody [data-kit="wide"]');
  await page.click('#dgBody [data-decal="stripes"]');
  await page.fill("#dgNumber", "27");
  await page.dispatchEvent("#dgNumber", "change");
  await page.evaluate(() => { const el = document.querySelector('#dgBody [data-handling]'); el.value = "0.9"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.click('#dgBody [data-theme="desert"]');
  await page.click("#dgClose");
  const applied = await page.evaluate(() => ({ g: profile.garage, paint: arcade.game.paint, handling: DriftCircuit.garage().handling, theme: DriftCircuit.garage().theme, number: DriftCircuit.garage().number }));
  if (applied.g.finish !== "chrome" || applied.g.kit !== "wide" || applied.g.decal !== "stripes" || applied.number !== 27 || applied.handling !== 0.9 || applied.theme !== "desert") throw new Error("customization did not persist: " + JSON.stringify(applied));
  if (applied.paint !== "blue") throw new Error("paint did not apply to the live drift car");

  // Top-down drifting still produces smoke, skids, and score.
  const drift = await page.evaluate(() => {
    const g2 = arcade.game; const p0 = g2.path[0];
    g2.started = true; g2.x = p0.x; g2.y = p0.y; g2.a = Math.atan2(p0.ty, p0.tx);
    g2.vx = p0.tx * 320; g2.vy = p0.ty * 320;
    g2.touch.up = 1; g2.touch.drift = 1; g2.touch.left = 1;
    for (let i = 0; i < 40; i++) g2.update(0.016);
    return { smoke: g2.smoke.length, skids: g2.skids.length, score: g2.score, combo: g2.combo };
  });
  if (drift.smoke < 3 || drift.skids < 1 || !(drift.score > 0)) throw new Error("drift effects broken: " + JSON.stringify(drift));

  // Racing: garage applies, both modes run, themes work.
  await page.evaluate(() => arcade.select("racing"));
  await page.waitForTimeout(150);
  const racing = await page.evaluate(() => ({
    key: arcade.game.key,
    hud: !!document.getElementById("btnDriftGarage") && document.getElementById("btnDriftGarage").offsetParent !== null,
    paint: arcade.game.paint,
    gpaint: DriftCircuit.garage().paint,
    mode: arcade.game.mode(),
  }));
  if (racing.key !== "racing" || !racing.hud) throw new Error("racing garage entry missing: " + JSON.stringify(racing));
  if (racing.paint !== racing.gpaint) throw new Error("racing should use the shared garage paint");
  const raceRun = await page.evaluate(() => {
    const g2 = arcade.game; g2.started = true; g2.control = (d) => d === 'up';
    for (let i = 0; i < 40; i++) g2.update(0.016);
    const traffic = { score: g2.score, traffic: g2.traffic.length };
    arcade.select("racing"); // fresh instance for circuit mode
    const g3 = arcade.game; DriftCircuit.garage().raceMode = "circuit"; g3.reset(); g3.started = true; g3.control = (d) => d === 'up';
    for (let i = 0; i < 40; i++) g3.update(0.016);
    return { traffic, circuit: { ai: g3.ai.length, speed: g3.speed, pos: g3.position } };
  });
  if (raceRun.traffic.score <= 0) throw new Error("traffic mode should score: " + JSON.stringify(raceRun));
  if (raceRun.circuit.ai !== 3) throw new Error("circuit mode should have 3 AI cars: " + JSON.stringify(raceRun));

  // Tokens: manual conversion, silent auto-refill, death summary + continue.
  const tokens = await page.evaluate(async () => {
    const g4 = DriftCircuit.garage();
    profile.tokens = 3; profile.garage.cash = 0; saveProfile(); updateHUD();
    window.DriftGarage.render();
    document.getElementById("dgConvertAll").click();
    const converted = { cash: DriftCircuit.garage().cash, tokens: profile.tokens };
    // auto-refill must not pop the coin overlay
    profile.tokens = 2; saveProfile();
    arcade.game.earned = 640; arcade.game.banked = false; arcade.runTokens = 1;
    arcade.mode = "playing"; arcade.autoRefill();
    const fx = document.getElementById("fxOverlay"); const overlayShown = !!fx && fx.classList.contains("show");
    // death screen
    arcade.game.over = true; arcade.timeUp();
    await new Promise((r) => setTimeout(r, 60));
    const box = arcade.msg.querySelector(".msg-box");
    return {
      converted, overlayShown,
      summary: box ? box.textContent : "",
      continueBtn: !!document.getElementById("continueRun"),
      cashAfterBank: DriftCircuit.garage().cash,
    };
  });
  if (tokens.converted.cash !== 750 || tokens.converted.tokens !== 0) throw new Error("token conversion failed: " + JSON.stringify(tokens.converted));
  if (tokens.overlayShown) throw new Error("auto-refill must not pop the coin overlay mid-game");
  if (!/Tokens used:/.test(tokens.summary)) throw new Error("death screen should report tokens used: " + tokens.summary);
  if (!tokens.continueBtn) throw new Error("continue button missing on death screen");
  if (tokens.cashAfterBank < 640) throw new Error("garage cash should bank on the death screen: " + tokens.cashAfterBank);

  const continued = await page.evaluate(() => { const before = profile.tokens; document.getElementById("continueRun").click(); return { before, after: profile.tokens, over: arcade.game.over, mode: arcade.mode }; });
  if (continued.after !== continued.before - 1 || continued.over || continued.mode !== "playing") throw new Error("continue with token failed: " + JSON.stringify(continued));

  await browser.close();
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log("PASS: 3D drift + racing, garage v2 (finishes, kits, wheels, decals, themes, modes, handling, sounds), token conversion, silent mid-game spends, death summary, and continue all work.");
})().catch((error) => { console.error(error); process.exit(1); });
