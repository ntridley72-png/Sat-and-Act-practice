/* Can we get a real GPU in this environment?
 * Headless Chromium falls back to SwiftShader, which makes frame times
 * meaningless in absolute terms. Headed Chrome on a Mac with a display
 * session should use the actual GPU. This checks which we have BEFORE
 * reporting any numbers, because the renderer string is the difference
 * between a usable measurement and a misleading one. */
const { chromium } = require('playwright-core')
const EXEC = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const headless = process.argv[2] !== 'headed'
;(async () => {
  const b = await chromium.launch({
    executablePath: EXEC,
    headless,
    args: headless ? ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] : ['--no-sandbox'],
  })
  const p = await b.newPage()
  await p.goto('http://127.0.0.1:8901/?opponents=0', { waitUntil: 'load' })
  await p.waitForTimeout(2500)
  const info = await p.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return { ok: false }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      ok: true,
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    }
  })
  console.log(`mode: ${headless ? 'headless' : 'headed'}`)
  console.log('vendor  :', info.vendor)
  console.log('renderer:', info.renderer)
  const software = /swiftshader|software|llvmpipe|angle \(google/i.test(String(info.renderer))
  console.log('verdict :', software ? 'SOFTWARE RASTERISER - numbers not representative' : 'HARDWARE GPU - numbers are real')
  await b.close()
})().catch((e) => { console.error('probe failed:', e.message); process.exit(1) })
