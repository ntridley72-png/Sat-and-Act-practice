/* Handling measurements for the player car: launch, braking, steady cornering, coasting and reverse.
 * Reads the car's state through the page's __rv2probe, so it measures the physics the player feels
 * rather than anything drawn.   node bench/serve.cjs &   node bench/handling.cjs
 * Set PLAYWRIGHT_EXEC to a Chromium; RV2_URL to point at another build. */
const { chromium } = require('playwright-core')
const EXEC = process.env.PLAYWRIGHT_EXEC || process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell'
const URL = process.env.RV2_URL || 'http://127.0.0.1:8901/?opponents=0'
;(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: 320, height: 180 } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  async function fresh() {
    await p.goto(URL, { waitUntil: 'load' })
    await p.waitForFunction('window.__ready === true', { timeout: 30000 })
    await p.waitForTimeout(1200)
    const go = await p.$('.rv2-go'); if (go) await go.click()
    await p.waitForTimeout(2200)
  }
  await fresh()
  const probe = () => p.evaluate(() => { const r = window.__rv2probe && window.__rv2probe(); return r && { t: performance.now() / 1000, x: r.x, z: r.z, speed: r.speed, yaw: r.yaw, fwd: r.fwdSpeed, lat: r.latSpeed, up: r.upright, steer: r.steering, gear: r.gear, rpm: r.rpm } })
  const reset = fresh
  async function hold(keys, ms, sample = 80) {
    for (const k of keys) await p.keyboard.down(k)
    const out = []; const t0 = (await probe()).t
    while (true) { const s = await probe(); s.t -= t0; out.push(s); if (s.t * 1000 >= ms) break; await p.waitForTimeout(sample) }
    for (const k of keys) await p.keyboard.up(k)
    return out
  }
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }
  const r = {}
  r.fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 1500) res(+(n / 1.5).toFixed(1)); else requestAnimationFrame(f) }; requestAnimationFrame(f) }))
  await reset()
  const launch = await hold(['KeyW'], 8000)
  const at = (arr, v) => (arr.find((s) => s.fwd >= v) || {}).t
  r.launch = { to10: at(launch, 10), to20: at(launch, 20), to30: at(launch, 30), top: Math.max(...launch.map((s) => s.fwd)).toFixed(1), gears: [...new Set(launch.map((s) => s.gear))].join('') }
  // braking from speed with S
  const last = launch[launch.length - 1]
  const brake = await hold(['KeyS'], 5000)
  const stop = brake.find((s) => Math.abs(s.fwd) < 0.8)
  r.brake = { from: last.fwd.toFixed(1), stopAfter: stop && stop.t.toFixed(2), distance: stop ? Math.hypot(stop.x - last.x, stop.z - last.z).toFixed(1) : null,
    peakDecelG: (() => { let m = 0; for (let i = 3; i < brake.length; i++) { const d = (brake[i - 3].fwd - brake[i].fwd) / (brake[i].t - brake[i - 3].t) / 9.81; m = Math.max(m, d) } return m.toFixed(2) })(),
    reverseAfter: brake[brake.length - 1].fwd.toFixed(1) }
  // cornering at three speeds, on the start straight so the grass penalty never applies:
  // reach the speed, then hold it with W while holding full left for 1.4 s
  r.corner = []
  for (const target of [10, 16, 22]) {
    await reset()
    let throttle = false
    const turn = []; let t0 = null; let started = false
    for (let i = 0; i < 400; i++) {
      const s0 = await probe()
      if (!started && s0.fwd >= target - 0.5) { started = true; t0 = s0.t; await p.keyboard.down('KeyA') }
      if (started) { s0.t -= t0; turn.push(s0) }
      const want = s0.fwd < target
      if (want !== throttle) { await p.keyboard[want ? 'down' : 'up']('KeyW'); throttle = want }
      if (started && s0.t > 1.5) break
      await p.waitForTimeout(40)
    }
    await p.keyboard.up('KeyW'); await p.keyboard.up('KeyA')
    const win = turn.filter((s) => s.t > 0.7)
    if (win.length < 2) { r.corner.push({ target, note: 'speed not reached on the straight', samples: turn.length }); continue }
    const w0 = win[0], w1 = win[win.length - 1]
    const yawRate = wrap(w1.yaw - w0.yaw) / (w1.t - w0.t)
    const v = win.reduce((a, s) => a + s.fwd, 0) / win.length
    r.corner.push({ target, speed: v.toFixed(1), yawRate: yawRate.toFixed(2), latG: (v * Math.abs(yawRate) / 9.81).toFixed(2), slipDeg: (Math.atan2(w1.lat, Math.max(1, w1.fwd)) * 57.3).toFixed(1), radius: (v / Math.max(0.01, Math.abs(yawRate))).toFixed(1), steer: w1.steer.toFixed(3), minUpright: Math.min(...turn.map((s) => s.up)).toFixed(3) })
  }
  // coasting
  await reset()
  await hold(['KeyW'], 3600)
  const coast = await hold([], 900)
  r.coast = { from: coast[0].fwd.toFixed(1), to: coast[coast.length - 1].fwd.toFixed(1), decelG: ((coast[0].fwd - coast[coast.length - 1].fwd) / coast[coast.length - 1].t / 9.81).toFixed(3) }
  // reverse from rest
  await reset()
  const rev = await hold(['KeyS'], 3500)
  r.reverse = { top: Math.min(...rev.map((s) => s.fwd)).toFixed(1) }
  console.log(JSON.stringify(r, null, 1)); console.log('page errors', errs.length, errs.slice(0, 2))
  await b.close()
})()
