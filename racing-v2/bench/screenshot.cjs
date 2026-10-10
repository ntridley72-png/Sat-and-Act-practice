/* Capture the production bundle rendering, at several grid sizes.
 * Proof the scene actually draws, not just that it mounts without throwing.
 */
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const EXEC = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const OUT = path.join(__dirname, 'shots')
;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] })
  for (const n of [0, 4, 12]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
    const errs = []
    p.on('pageerror', (e) => errs.push(String(e)))
    await p.goto(`http://127.0.0.1:8901/?opponents=${n}`, { waitUntil: 'load' })
    await p.waitForFunction('window.__ready === true', { timeout: 20000 })
    // Capture the intro first, then click through to the race the way a
    // player would, so the shots show both screens that actually ship.
    await p.waitForTimeout(2000)
    if (n === 0) await p.screenshot({ path: path.join(OUT, 'intro.png') })
    const go = await p.$('.rv2-go')
    if (go) await go.click()
    await p.waitForTimeout(6000)
    const file = path.join(OUT, `grid-${n}.png`)
    await p.screenshot({ path: file })
    // A black frame means it mounted but drew nothing, which a mount check
    // alone would not catch. Sample the pixels to tell the difference.
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
    console.log(`  grid ${String(n).padStart(2)}: ${path.basename(file)}  non-dark pixels ${(nonBlack * 100).toFixed(1)}%  errors ${errs.length}`)
    if (errs.length) console.log('     ', errs[0].slice(0, 140))
    await p.close()
  }
  await b.close()
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
