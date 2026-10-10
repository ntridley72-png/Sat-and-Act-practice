/* Runner for the headless harnesses in this directory.
 *
 * The app's sources use extensionless imports (Vite's convention). Node's ESM
 * loader requires explicit extensions, so rather than littering the app with
 * .ts suffixes to suit a test runner, each harness is bundled with esbuild --
 * already present as a Vite dependency -- and the bundle is executed.
 *
 * Usage: node tools/run.mjs tools/<harness>.mjs
 */
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const entry = process.argv[2]
if (!entry) {
  console.error('usage: node tools/run.mjs tools/<harness>.mjs')
  process.exit(2)
}

const out = path.join(mkdtempSync(path.join(tmpdir(), 'rv2-')), 'bundle.mjs')
await build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  // three is only needed by the art module; the AI harnesses must not drag a
  // renderer into a headless run, so it is left external and never imported.
  external: ['three'],
  logLevel: 'warning',
})
await import(pathToFileURL(out).href)
