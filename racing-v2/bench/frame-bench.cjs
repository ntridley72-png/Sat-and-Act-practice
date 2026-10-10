/* Frame times on the PRODUCTION bundle at 0/4/8/12 opponents.
 *
 * HONEST CAVEAT, stated up front because the numbers are meaningless without
 * it: headless Chromium here has no GPU and falls back to SwiftShader software
 * rasterisation. These numbers therefore measure the CPU cost of the scene --
 * the physics worker, the driver loop, the React/R3F overhead -- on a software
 * rasteriser. They are a sound RELATIVE comparison across grid sizes, which is
 * what the frame-budget question actually is, and they are a pessimistic floor
 * for absolute performance. They are NOT what a student's GPU will do.
 */
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function execPath() {
  if (process.env.PLAYWRIGHT_EXEC) return process.env.PLAYWRIGHT_EXEC
  try {
    const p = chromium.executablePath()
    if (p && fs.existsSync(p)) return p
  } catch {}
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
  // Playwright's layout varies by version and arch, so try the known shapes
  // rather than hardcoding one and failing opaquely.
  const dirs = fs.readdirSync(cache).filter((d) => d.startsWith('chromium-'))
  const shapes = [
    ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ['chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ]
  for (const d of dirs) {
    for (const shape of shapes) {
      const c = path.join(cache, d, ...shape)
      if (fs.existsSync(c)) return c
    }
  }
  throw new Error('no chromium; run: npx playwright install chromium')
}

function stats(a) {
  const s = [...a].sort((x, y) => x - y)
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  return { p50: q(0.5), p95: q(0.95), max: s[s.length - 1], mean: a.reduce((x, y) => x + y, 0) / a.length, n: a.length }
}

;(async () => {
  const browser = await chromium.launch({
    executablePath: execPath(),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  })
  console.log('grid   frames   mean ms   p50 ms   p95 ms   max ms   implied fps (p50)')
  const results = []
  for (const n of [0, 4, 8, 12]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
    await page.goto(`http://127.0.0.1:8901/?opponents=${n}`, { waitUntil: 'load' })
    await page.waitForFunction('window.__ready === true', { timeout: 20000 })
    // Discard the first second: shader compilation and the physics worker
    // spinning up are startup cost, not steady state.
    await page.waitForTimeout(1500)
    await page.evaluate('window.__frames.length = 0')
    await page.waitForTimeout(5000)
    const frames = await page.evaluate('window.__frames')
    const s = stats(frames)
    results.push({ n, ...s, errs: errs.length })
    console.log(
      `  ${String(n).padStart(2)}   ${String(s.n).padStart(6)}   ${s.mean.toFixed(2).padStart(7)}   ${s.p50.toFixed(2).padStart(6)}   ${s.p95.toFixed(2).padStart(6)}   ${s.max.toFixed(2).padStart(6)}   ${(1000 / s.p50).toFixed(1).padStart(8)}` +
      (errs.length ? `   [${errs.length} page errors]` : ''),
    )
    if (errs.length) console.log('      first error:', errs[0].slice(0, 160))
    await page.close()
  }
  await browser.close()
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2))
  console.log('\nwritten bench/results.json')
})().catch((e) => { console.error('BENCH FAILED:', e.message); process.exit(1) })
