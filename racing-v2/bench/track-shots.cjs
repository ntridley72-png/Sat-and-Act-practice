/* Per-track QA screenshots: intro (with the track picker), the grid, and a
 * driven view, for every track id given on the command line. Output goes to
 * bench/shots/.
 *
 * Usage: node bench/track-shots.cjs [trackId ...]
 *        HEADLESS=1 node bench/track-shots.cjs        (SwiftShader fallback)
 *
 * Requires: node bench/serve.cjs in another shell (port 8901), and a fresh
 * `npm run build`.
 *
 * The point is not automation for its own sake: three bugs in this project's
 * history -- cars cartwheeling off the grid, a car with eight wheels, and
 * every car floating half a box above its own wheels -- were invisible to
 * every automated check and obvious on sight. A person still has to look at
 * these files.
 */
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function resolveExecutable() {
  if (process.env.PLAYWRIGHT_EXEC) return process.env.PLAYWRIGHT_EXEC
  try {
    const p = chromium.executablePath()
    if (p && fs.existsSync(p)) return p
  } catch (e) { /* fall through */ }
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
  for (const d of fs.readdirSync(cache).filter((n) => n.startsWith('chromium-'))) {
    for (const shape of [
      ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
      ['chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ]) {
      const c = path.join(cache, d, ...shape)
      if (fs.existsSync(c)) return c
    }
  }
  throw new Error('Could not locate Chromium. Install it with: npx playwright install chromium')
}

const OUT = path.join(__dirname, 'shots')
const tracks = process.argv.slice(2)
if (!tracks.length) {
  console.error('usage: node bench/track-shots.cjs <trackId> [trackId ...]')
  process.exit(2)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const headless = process.env.HEADLESS === '1'
  const b = await chromium.launch({
    executablePath: resolveExecutable(),
    headless,
    args: headless ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] : ['--no-sandbox'],
  })
  for (const track of tracks) {
    const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
    const errs = []
    p.on('pageerror', (e) => errs.push(String(e)))
    await p.goto(`http://127.0.0.1:8901/?opponents=8&track=${encodeURIComponent(track)}`, { waitUntil: 'load' })
    await p.waitForFunction('window.__ready === true', { timeout: 20000 })
    await p.waitForTimeout(1500)
    await p.screenshot({ path: path.join(OUT, `${track}-intro.png`) })

    const go = await p.$('.rv2-go')
    if (go) await go.click()
    await p.waitForTimeout(2500)
    await p.screenshot({ path: path.join(OUT, `${track}-grid.png`) })

    // Drive for a few seconds so the shot is mid-track, then capture.
    await p.keyboard.down('w')
    await p.waitForTimeout(7000)
    await p.keyboard.up('w')
    await p.waitForTimeout(400)
    await p.screenshot({ path: path.join(OUT, `${track}-drive.png`) })

    const nonBlack = await p.evaluate(() => {
      const c = document.querySelector('canvas')
      if (!c) return -1
      const gl = c.getContext('webgl2') || c.getContext('webgl')
      if (!gl) return -2
      const px = new Uint8Array(c.width * c.height * 4)
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px)
      let n = 0
      for (let i = 0; i < px.length; i += 4) if (px[i] > 12 || px[i + 1] > 12 || px[i + 2] > 12) n++
      return n / (px.length / 4)
    })
    console.log(`${track}: intro/grid/drive captured  non-dark ${(nonBlack * 100).toFixed(1)}%  errors ${errs.length}`)
    if (errs.length) console.log('   ', errs[0].slice(0, 160))
    await p.close()
  }
  await b.close()
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
