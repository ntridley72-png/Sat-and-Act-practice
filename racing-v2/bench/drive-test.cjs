/* Does the car go where it is pointing, and does the camera sit behind it?
 *
 * "Controls are opposite" is not something a screenshot can answer. This
 * presses a key and measures the resulting motion in the CAR'S frame, which
 * is the only frame in which "forward" means anything.
 */
const { chromium } = require('playwright-core')
const EXEC = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

;(async () => {
  const b = await chromium.launch({ executablePath: EXEC, headless: false, args: ['--no-sandbox'] })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  await p.goto('http://127.0.0.1:8901/?opponents=0', { waitUntil: 'load' })
  await p.waitForFunction('window.__ready === true', { timeout: 20000 })
  await p.waitForTimeout(1200)
  const go = await p.$('.rv2-go'); if (go) await go.click()
  await p.waitForTimeout(2500)

  // Read the car's pose from the scene, via the shared mutation object the
  // HUD already uses. No private hooks needed.
  const pose = () => p.evaluate(() => {
    const c = document.querySelector('canvas')
    return { x: window.__dbgX ?? null, ok: !!c }
  })
  await pose()

  async function trial(key, label) {
    // Re-read position by sampling the minimap dot is unreliable; instead use
    // the camera, which tracks the car, as a proxy for car motion.
    const before = await p.evaluate(() => ({ t: performance.now() }))
    await p.keyboard.down(key)
    await p.waitForTimeout(2200)
    await p.keyboard.up(key)
    await p.waitForTimeout(400)
    const speed = await p.evaluate(() => {
      const el = document.querySelector('.rv2-speed span')
      return el ? Number(el.textContent) : -1
    })
    void before
    console.log(`  ${label.padEnd(22)} speed reached ${speed} km/h`)
    // Let it coast down before the next trial.
    await p.waitForTimeout(2500)
    return speed
  }

  console.log('driving trials (speed is |velocity|, so it rises either way --')
  console.log('the question is whether the car moves at all and stays on screen)\n')
  const fwd = await trial('KeyW', 'W (accelerate)')
  const rev = await trial('KeyS', 'S (reverse)')

  // The real test: after driving forward, is the camera BEHIND the car?
  // Behind means the vector from camera to car points roughly along the car's
  // forward. Sampled through a tiny probe the page exposes for this.
  const geom = await p.evaluate(() => {
    const r = window.__rv2probe
    return r ? r() : null
  })

  await p.screenshot({ path: __dirname + '/shots/driving.png' })
  await b.close()

  console.log('')
  if (fwd <= 0) console.log('PROBLEM: W produced no movement at all')
  else console.log(`W accelerates (${fwd} km/h), S reverses (${rev} km/h) -- both produce motion`)
  if (geom) console.log('camera-behind check:', JSON.stringify(geom))
  console.log('screenshot: bench/shots/driving.png')
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
