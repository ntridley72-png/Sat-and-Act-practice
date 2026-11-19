/* Driving feel of the v2 player car, measured through the page's __rv2probe: the car's heading
 * follows the car (the chassis pose lives in the object's matrix, not its quaternion), launch and
 * top speed, braking before reversing, steering limited by grip, no spin, and a lifted throttle
 * slows the car a little. Bounds are loose on purpose: the page renders in software here and the
 * frame rate varies, which stretches time but not the physics.
 *
 * Needs the built bundle (racing-v2/dist). Run: node tests/racing-v2-handling.cjs */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const root = path.join(__dirname, '..');
const executablePath = process.env.PLAYWRIGHT_EXEC || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

(async () => {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/racing-v2/')
      ? path.join(root, 'racing-v2/dist', url.slice(11))
      : path.join(root, url === '/' ? 'SAT & ACT Practice.html' : url.slice(1));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const probe = () => page.evaluate(() => { const r = window.__rv2probe && window.__rv2probe(); return r && { t: performance.now() / 1000, x: r.x, z: r.z, yaw: r.yaw, fwd: r.fwdSpeed, lat: r.latSpeed, up: r.upright, steer: r.steering, gear: r.gear, rpm: r.rpm, vx: r.velocity.x, vz: r.velocity.z }; });
    async function fresh() {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => typeof RacingV2 !== 'undefined');
      await page.evaluate(() => { RacingV2.setLocal(null); arcade.select('racing'); });
      await page.waitForSelector('.rv2-go');
      await page.click('.rv2-go');
      await page.waitForFunction(() => window.__rv2probe && window.__rv2probe(), null, { timeout: 30000 });
      await page.waitForTimeout(2500);
    }
    async function hold(keys, ms) {
      for (const k of keys) await page.keyboard.down(k);
      const out = []; const t0 = (await probe()).t;
      for (;;) { const s = await probe(); s.t -= t0; out.push(s); if (s.t * 1000 >= ms) break; await page.waitForTimeout(80); }
      for (const k of keys) await page.keyboard.up(k);
      return out;
    }

    // ---- launch, heading and steering ------------------------------------------------------
    await fresh();
    const launch = await hold(['KeyW'], 6500);
    const topSeen = Math.max(...launch.map((s) => s.fwd));
    const t20 = (launch.find((s) => s.fwd >= 20) || {}).t;
    ok(t20 && t20 > 2 && t20 < 6, `0-20 m/s should take a few seconds, took ${t20}`);
    ok(new Set(launch.map((s) => s.gear)).size >= 4, 'the gearbox should move through several gears while accelerating');
    const rpmSeen = launch.map((s) => s.rpm);
    ok(Math.max(...rpmSeen) > 0.85 && Math.min(...rpmSeen.slice(3)) < 0.8, 'engine speed should rise and fall with the shifts');
    ok(topSeen > 22 && topSeen < 36, `top speed should settle near the track limit, saw ${topSeen.toFixed(1)}`);

    const yaw0 = launch[launch.length - 1].yaw;
    const turn = await hold(['KeyW', 'KeyA'], 1800);
    const yawChange = Math.abs(wrap(turn[turn.length - 1].yaw - yaw0));
    ok(yawChange > 0.25, `the chassis heading must follow the car when it turns, changed ${yawChange.toFixed(2)} rad`);
    const mid = turn[Math.floor(turn.length / 2)], end = turn[turn.length - 1];
    const velAngle = (s) => Math.atan2(s.vx, s.vz);
    ok(Math.abs(wrap(wrap(end.yaw - mid.yaw) - wrap(velAngle(end) - velAngle(mid)))) < 0.6, 'heading and direction of travel must turn together (no stale heading)');
    ok(Math.min(...turn.map((s) => s.up)) > 0.99, 'the car must stay upright in a turn');
    const speedSteer = Math.max(...turn.map((s) => Math.abs(s.steer)));
    ok(speedSteer < 0.2, `at speed the steering lock must shrink to what the tyres hold, saw ${speedSteer.toFixed(3)} rad`);
    const slip = Math.max(...turn.map((s) => Math.abs(Math.atan2(s.lat, Math.max(1, s.fwd)))));
    ok(slip < 0.6, `a held turn must not spin the car, peak slip ${slip.toFixed(2)} rad`);

    // ---- braking comes before reverse -------------------------------------------------------
    await fresh();
    const run = await hold(['KeyW'], 5000);
    const from = run[run.length - 1];
    ok(from.fwd > 15, `needs speed to brake from, had ${from.fwd.toFixed(1)}`);
    const brake = await hold(['KeyS'], 6500);
    const early = brake.filter((s) => s.t < 1.2);
    ok(early.every((s) => s.fwd > -0.5), 'S must brake first; the car may not reverse while it is still moving forward');
    const stopped = brake.find((s) => Math.abs(s.fwd) < 0.8);
    ok(stopped, 'the car must come to a stop under braking');
    if (stopped) {
      const dist = Math.hypot(stopped.x - from.x, stopped.z - from.z);
      const decel = (from.fwd - 0) / stopped.t / 9.81;
      ok(decel > 0.4 && decel < 1.6, `braking should be firm but believable, average ${decel.toFixed(2)} g`);
      ok(dist > from.fwd * from.fwd / (2 * 1.6 * 9.81) - 3, `stopping distance should not beat a 1.6 g limit, was ${dist.toFixed(1)} m`);
    }
    ok(Math.min(...brake.map((s) => s.fwd)) > -11, 'reverse should be a slow crawl');

    // ---- a lifted throttle slows the car, but gently ---------------------------------------
    await fresh();
    await hold(['KeyW'], 3000);
    const coast = await hold([], 900);
    const lost = coast[0].fwd - coast[coast.length - 1].fwd;
    ok(lost > 0.05 && lost < 3.5, `coasting should shed a little speed, lost ${lost.toFixed(2)} m/s in ${coast[coast.length - 1].t.toFixed(1)} s`);

    ok(errors.length === 0, 'page errors: ' + errors.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fails.length ? 'FAIL:\n - ' + fails.join('\n - ') : 'PASS: the car turns its heading with its path, accelerates through the gears, steers within grip, brakes before reversing and coasts gently.');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
