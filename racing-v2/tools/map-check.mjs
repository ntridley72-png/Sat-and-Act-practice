/* Track format checker: the catalog, plus a battery of negative fixtures.
 *
 * Run: node tools/run.mjs tools/map-check.mjs
 *
 * A validator that has never rejected anything is unverified, so this harness
 * does both halves: every catalog track must pass with zero errors, and a
 * suite of deliberately broken fixtures must each fail WITH THE RIGHT REASON.
 * The error-code assertions are the point -- a fixture that trips the wrong
 * rule is a validator bug even though the test "failed correctly".
 */
import {
  validateTrack,
  validateCatalog,
  parseTrack,
  ERR,
  FORMAT_TAG,
  FORMAT_VERSION,
} from '../src/tracks/format'
import { TRACKS, DEFAULT_TRACK_ID } from '../src/tracks/catalog'

let failures = 0
function ok(name) {
  console.log(`  PASS  ${name}`)
}
function fail(name, detail) {
  failures++
  console.log(`  FAIL  ${name}`)
  for (const line of String(detail).split('\n')) console.log(`        ${line}`)
}

/* A small synthetic circuit that satisfies every rule. Deliberately not one of
 * the shipped tracks: this is the control in the experiment, and it must not
 * silently change when the catalog does. */
function fixture() {
  return {
    format: FORMAT_TAG,
    version: FORMAT_VERSION,
    id: 'fixture-ring',
    name: 'Fixture Ring',
    blurb: 'A synthetic loop used only by the validator tests.',
    theme: 'flats',
    difficulty: 1,
    seed: 'fixture-ring',
    direction: 'forward',
    centerline: [
      { x: 0, y: 0, half: 9 },
      { x: 90, y: 0, half: 9 },
      { x: 120, y: 14, half: 7 },
      { x: 126, y: 44, half: 5.5 },
      { x: 104, y: 62, half: 6 },
      { x: 60, y: 64, half: 7 },
      { x: 40, y: 88, half: 5 },
      { x: 0, y: 92, half: 5 },
      { x: -40, y: 80, half: 7 },
      { x: -70, y: 50, half: 8 },
      { x: -64, y: 14, half: 9 },
      { x: -40, y: 0, half: 9 },
    ],
    checkpoints: [0.25, 0.5, 0.75],
    grid: { rowGap: 7.5, stagger: 2.6, lateral: 2.3, setback: 6, rows: 7 },
    surface: { offroad: 'grass', brake: 22 },
    hazards: [],
    landmarks: [],
    scenery: { kind: 'pines', count: 60, tier: 'low' },
    weather: ['dry'],
    ai: { cornerBudget: 0.3, topSpeed: 32 },
    provenance: { origin: 'original', license: 'CC0-1.0', note: 'test fixture' },
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v))
const codes = (errors) => errors.map((e) => (e.match(/^\[([a-z-]+)\]/) || [])[1])

/* Every fixture: [name, expected code or null, mutate-and-return-errors]. */
const cases = [
  ['valid fixture passes', null, () => validateTrack(fixture())],
  ['elevation is rejected, not flattened', ERR.unsupported, () => {
    const t = fixture(); t.centerline[2].ele = 4; return validateTrack(t)
  }],
  ['banking is rejected, not flattened', ERR.unsupported, () => {
    const t = fixture(); t.centerline[2].bank = 2; return validateTrack(t)
  }],
  ['reverse direction unsupported', ERR.unsupported, () => {
    const t = fixture(); t.direction = 'reverse'; return validateTrack(t)
  }],
  ['too few control points', ERR.loop, () => {
    const t = fixture(); t.centerline = t.centerline.slice(0, 6); return validateTrack(t)
  }],
  ['non-finite coordinate', ERR.loop, () => {
    const t = fixture(); t.centerline[3].x = NaN; return validateTrack(t)
  }],
  ['zero-length control segment', ERR.loop, () => {
    const t = fixture(); t.centerline[3] = { x: t.centerline[2].x + 1, y: t.centerline[2].y, half: 6 }
    return validateTrack(t)
  }],
  ['half-width under a car', ERR.width, () => {
    const t = fixture(); t.centerline[3].half = 2.5; return validateTrack(t)
  }],
  ['hairpin tighter than the driver floor', ERR.radius, () => {
    const t = fixture()
    // A genuine hairpin: fold the exit back beside the entry with too small a
    // radius at the apex.
    t.centerline = [
      { x: 0, y: 0, half: 9 }, { x: 120, y: 0, half: 9 },
      { x: 140, y: 4, half: 6 }, { x: 144, y: 14, half: 5 },
      { x: 136, y: 20, half: 6 }, { x: 120, y: 24, half: 7 },
      { x: 90, y: 28, half: 7 }, { x: 40, y: 50, half: 8 },
      { x: -20, y: 70, half: 8 }, { x: -70, y: 55, half: 8 },
      { x: -64, y: 14, half: 9 }, { x: -40, y: 0, half: 9 },
    ]
    return validateTrack(t)
  }],
  ['road overlapping itself', ERR.selfCross, () => {
    const t = fixture()
    // Outbound at y=0, return at y=4, halves 5: centreline gap 4 m where the
    // road needs 12 -- an overlapping fold.
    t.centerline = [
      { x: 0, y: 0, half: 5 }, { x: 120, y: 0, half: 5 },
      { x: 180, y: 0, half: 5 }, { x: 220, y: 2, half: 5 },
      { x: 260, y: 4, half: 5 }, { x: 300, y: 4, half: 5 },
      { x: 320, y: 2, half: 5 }, { x: 300, y: 0, half: 5 },
      { x: 200, y: 0.4, half: 4 }, { x: 100, y: 0.4, half: 4 },
    ]
    // NB: this layout also folds at the ends; the assertion only needs the
    // overlap code to be present.
    return validateTrack(t)
  }],
  ['checkpoints out of order', ERR.checkpoint, () => {
    const t = fixture(); t.checkpoints = [0.5, 0.25]; return validateTrack(t)
  }],
  ['checkpoint count below minimum', ERR.checkpoint, () => {
    const t = fixture(); t.checkpoints = [0.5]; return validateTrack(t)
  }],
  ['checkpoints too close together', ERR.checkpoint, () => {
    const t = fixture(); t.checkpoints = [0.5, 0.51]; return validateTrack(t)
  }],
  ['gate in the grid zone', ERR.checkpoint, () => {
    const t = fixture(); t.checkpoints = [0.03, 0.5]; return validateTrack(t)
  }],
  ['grid slot needs more road than exists', ERR.grid, () => {
    const t = fixture()
    t.grid = { ...t.grid, lateral: 3.4 }
    t.centerline[0] = { ...t.centerline[0], half: 4.2 }
    return validateTrack(t)
  }],
  ['grid spec outside its bands', ERR.grid, () => {
    const t = fixture(); t.grid = { ...t.grid, rowGap: 2 }; return validateTrack(t)
  }],
  ['scenery over the tier cap', ERR.propBudget, () => {
    const t = fixture(); t.scenery = { kind: 'pines', count: 9999, tier: 'low' }; return validateTrack(t)
  }],
  ['scenery too sparse to be scenery', ERR.propBudget, () => {
    const t = fixture(); t.scenery = { kind: 'pines', count: 10, tier: 'low' }; return validateTrack(t)
  }],
  ['unknown theme', ERR.theme, () => {
    const t = fixture(); t.theme = 'neon-dreams'; return validateTrack(t)
  }],
  ['surface brake outside its band', ERR.surface, () => {
    const t = fixture(); t.surface = { offroad: 'grass', brake: 60 }; return validateTrack(t)
  }],
  ['weather without a dry variant', ERR.surface, () => {
    const t = fixture(); t.weather = ['wet']; return validateTrack(t)
  }],
  ['puddle on a dry-only track', ERR.hazard, () => {
    const t = fixture(); t.hazards = [{ kind: 'puddle', atFraction: 0.4, lengthFraction: 0.05, side: 'left' }]
    return validateTrack(t)
  }],
  ['hazard overlapping the grid', ERR.hazard, () => {
    const t = fixture(); t.hazards = [{ kind: 'gravel-trap', atFraction: 0.04, lengthFraction: 0.05, side: 'left' }]
    return validateTrack(t)
  }],
  ['landmark inside the runoff', ERR.scenery, () => {
    const t = fixture(); t.landmarks = [{ name: 'Too Close', kind: 'spire', atFraction: 0.5, side: 'left', offset: 6 }]
    return validateTrack(t)
  }],
  ['ai numbers outside their bands', ERR.ai, () => {
    const t = fixture(); t.ai = { cornerBudget: 0.95, topSpeed: 120 }; return validateTrack(t)
  }],
  ['duplicate ids in the catalog', ERR.duplicate, () => validateCatalog([fixture(), fixture()])],
  ['default id missing from the catalog', 'malformed', () => validateCatalog([fixture()], 'does-not-exist')],
]

console.log('validator fixtures')
for (const [name, expect, run] of cases) {
  let errs
  try {
    errs = run()
  } catch (e) {
    fail(name, `threw: ${e && e.stack ? e.stack : e}`)
    continue
  }
  if (expect === null) {
    if (errs.length === 0) ok(name)
    else fail(name, `expected no errors, got:\n${errs.join('\n')}`)
    continue
  }
  const found = codes(errs)
  if (found.includes(expect)) ok(name)
  else fail(name, `expected code [${expect}], got [${found.join(', ') || 'none'}]\n${errs.join('\n')}`)
}

/* ---- parseTrack: the malformed-input boundary ---------------------------- */
console.log('parseTrack')
const parseCases = [
  ['non-object input', () => parseTrack('not a track'), false],
  ['null input', () => parseTrack(null), false],
  ['wrong format tag', () => { const t = fixture(); t.format = 'something.else'; return parseTrack(t) }, false],
  ['wrong version', () => { const t = fixture(); t.version = 99; return parseTrack(t) }, false],
  ['missing centerline', () => { const t = fixture(); delete t.centerline; return parseTrack(t) }, false],
  ['NaN coordinate', () => { const t = fixture(); t.centerline[0].x = NaN; return parseTrack(t) }, false],
  ['bad id shape', () => { const t = fixture(); t.id = 'Has Spaces!'; return parseTrack(t) }, false],
  ['unknown weather id', () => { const t = fixture(); t.weather = ['dry', 'snow']; return parseTrack(t) }, false],
  ['valid track parses', () => parseTrack(fixture()), true],
]
for (const [name, run, expectOk] of parseCases) {
  const r = run()
  if (r.ok === expectOk) ok(name)
  else fail(name, `expected ok=${expectOk}, got ok=${r.ok}: ${r.errors.join('; ')}`)
}

/* ---- the real catalog ---------------------------------------------------- */
console.log(`catalog (${TRACKS.length} tracks, default "${DEFAULT_TRACK_ID}")`)
if (TRACKS.length === 0) {
  ok('catalog is empty (schema phase; tracks land next)')
} else {
  const errs = validateCatalog(TRACKS, DEFAULT_TRACK_ID ?? undefined)
  if (errs.length === 0) ok('every catalog track validates')
  else fail('catalog validation', errs.join('\n'))

  if (DEFAULT_TRACK_ID === null) fail('catalog default', 'DEFAULT_TRACK_ID is null with a non-empty catalog')
  else {
    const def = TRACKS.find((t) => t.id === DEFAULT_TRACK_ID)
    if (def) ok(`default track "${DEFAULT_TRACK_ID}" exists`)
    else fail('catalog default', `"${DEFAULT_TRACK_ID}" is not in the catalog`)
  }

  for (const t of TRACKS) {
    const single = validateTrack(t)
    if (single.length === 0) ok(`${t.id} (${t.name})`)
    else fail(`${t.id}`, single.join('\n'))
  }

  // parseTrack must accept each shipped track: the format's own serializer
  // path (JSON round trip) must not reject data the catalog authored.
  for (const t of TRACKS) {
    const r = parseTrack(JSON.parse(JSON.stringify(t)))
    if (r.ok) ok(`${t.id} survives JSON round trip`)
    else fail(`${t.id} JSON round trip`, r.errors.join('\n'))
  }
}

console.log('')
if (failures) {
  console.log(`MAP CHECK FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log('MAP CHECK PASSED')
