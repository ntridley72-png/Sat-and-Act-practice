/* §5c SHIP GATE: prove no third-party geometry or audio reached the build.
 *
 * A build that cannot pass this does not ship. The project's whole asset
 * position -- CC0 repository, ad-supported site, original art only -- rests on
 * the claim that nothing third-party is in the bundle, and a claim nobody
 * checks is just a hope.
 *
 * What this checks, and why each one:
 *   1. No binary asset files in dist/ at all. The art is procedural, so there
 *      should be nothing to find. Any file here is a regression.
 *   2. No data: URI smuggling an asset into a JS chunk. assetsInlineLimit is 0
 *      precisely so this cannot happen silently, but a dependency can still
 *      inline its own; a base64 blob inside a chunk is invisible to a file
 *      listing, which is exactly why it is worth looking for.
 *   3. No magic bytes for known asset formats anywhere in the output.
 *   4. No source reference to an asset path or loader. A GLTFLoader call is a
 *      future violation even if nothing is loaded yet.
 *   5. The allowlist is EXACTLY the eight approved CC0 audio files -- none of
 *      which should be in this bundle, since audio is not wired yet.
 */
import fs from 'node:fs'
import path from 'node:path'

/* Paths resolve from the project root passed in, or the cwd -- NOT from
 * import.meta.url. This file imports only node builtins so it runs directly,
 * but an earlier version resolved relative to its own URL and was run through
 * the esbuild runner, which relocates the bundle to a temp directory. It then
 * scanned an empty path and reported "GATE PASSED" having examined nothing.
 * A gate that passes by looking at nothing is worse than no gate, so it now
 * refuses to run unless it can see the directories it is meant to check. */
const ROOT = process.argv[2] ?? process.cwd()
const DIST = path.join(ROOT, 'dist')
const SRC = path.join(ROOT, 'src')

for (const [name, dir] of [['dist', DIST], ['src', SRC]]) {
  if (!fs.existsSync(dir)) {
    console.error(`GATE CANNOT RUN: ${name} not found at ${dir}`)
    console.error('Run from racing-v2/, or pass the project root as argv[2].')
    process.exit(2)
  }
}

/* The ONLY third-party binaries this project may ever ship, per the operator's
 * explicit CC0 carve-out. Everything else is a gate failure, not a judgement
 * call. Not yet wired, so none should appear. */
const ALLOWED_AUDIO = new Set([
  'accelerate.mp3', 'boost.mp3', 'crash.mp3', 'engine.mp3',
  'honk.mp3', 'tire-brake.mp3', 'train.mp3', 'water.mp3',
])

const BINARY_EXT = /\.(glb|gltf|fbx|obj|dae|blend|3ds|stl|ply|png|jpe?g|gif|webp|bmp|tga|hdr|exr|ktx2?|basis|dds|mp3|wav|ogg|m4a|flac|ttf|otf|woff2?|bin)$/i

const failures = []
const notes = []

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

// --- 1. binary asset files in the build -----------------------------------
const distFiles = walk(DIST)
const binaries = distFiles.filter((f) => BINARY_EXT.test(f))
for (const f of binaries) {
  const base = path.basename(f)
  if (ALLOWED_AUDIO.has(base)) notes.push(`allowed CC0 audio present: ${base}`)
  else failures.push(`binary asset in build: ${path.relative(DIST, f)}`)
}
if (!binaries.length) notes.push('no binary assets in dist/ (expected: art is procedural)')

// --- 2 & 3. embedded assets inside JS -------------------------------------
const MAGIC = [
  ['glTF', 'glTF binary (.glb)'],
  ['\x89PNG', 'PNG'],
  ['\xFF\xD8\xFF', 'JPEG'],
  ['RIFF', 'RIFF container (wav/webp)'],
  ['OggS', 'Ogg'],
  ['ID3', 'MP3 with ID3'],
  ['\x00\x01\x00\x00\x00', 'TrueType font'],
  ['wOFF', 'WOFF font'],
  ['wOF2', 'WOFF2 font'],
]
for (const f of distFiles.filter((f) => f.endsWith('.js'))) {
  const text = fs.readFileSync(f, 'latin1')
  const rel = path.relative(DIST, f)

  const dataUris = text.match(/data:(image|audio|video|font|model|application\/octet-stream)[^"'`)\s]{64,}/g)
  if (dataUris) failures.push(`${rel}: ${dataUris.length} embedded data: URI(s), first starts "${dataUris[0].slice(0, 48)}..."`)

  for (const [sig, name] of MAGIC) {
    if (text.includes(sig)) failures.push(`${rel}: embedded ${name} magic bytes`)
  }
}

// --- 4. source references to assets or loaders ----------------------------
const LOADERS = /\b(GLTFLoader|FBXLoader|OBJLoader|TextureLoader|AudioLoader|useGLTF|useTexture|useLoader|DRACOLoader)\b/
for (const f of walk(SRC).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))) {
  const text = fs.readFileSync(f, 'utf8')
  const rel = path.relative(SRC, f)
  const m = text.match(LOADERS)
  if (m) failures.push(`${rel}: references asset loader ${m[0]} -- procedural art must not load files`)
  const assetImport = text.match(/from\s+['"][^'"]*\.(glb|gltf|png|jpg|mp3|wav|ogg|hdr|ttf)['"]/)
  if (assetImport) failures.push(`${rel}: imports an asset file: ${assetImport[0]}`)
}

// --- report ---------------------------------------------------------------
console.log('§5c COMPLIANCE GATE — third-party asset provenance\n')
const srcFiles = walk(SRC)
console.log(`scanned: ${distFiles.length} build files, ${srcFiles.length} source files`)
if (distFiles.length === 0 || srcFiles.length === 0) {
  console.error('\nGATE CANNOT RUN: nothing was scanned. Refusing to report a pass.')
  process.exit(2)
}
for (const n of notes) console.log(`  note: ${n}`)
console.log('')
if (failures.length) {
  console.log('GATE FAILED:')
  for (const f of failures) console.log(`  - ${f}`)
  console.log('\nThis build must not ship.')
  process.exit(1)
}
console.log('GATE PASSED: no third-party geometry, audio, fonts or textures in the build.')
console.log('All visual output is generated at runtime from code.')
