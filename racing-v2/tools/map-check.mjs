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
import { createHash } from 'node:crypto'
import { TRACKS, DEFAULT_TRACK_ID, buildTrackLine, trackGates } from '../src/tracks/catalog'
import { gridSlot } from '../src/ai/gridSlots'
import { scatterTrack, isClearOfRoad, SCENERY_CLEARANCE } from '../src/tracks/scatter'

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

/* ---- APEX_FLATS migration pin -------------------------------------------
 * These numbers were recorded from the code as it stood BEFORE the circuit
 * moved out of src/ai/racingLine.ts into the v1 format. The move was proven
 * exact: a temporary verifier built the HEAD version of APEX_FLATS and the
 * catalog definition side by side and sampled both 4096 times at the
 * runtime's default 24 samples per segment -- the maximum difference in x,
 * y, half, heading and curvature was 0. If the format could not carry the
 * existing circuit unchanged, that comparison would have shown it.
 *
 * The pin stays afterwards as a regression guard: any edit to the circuit
 * geometry must consciously update these constants.
 *
 * The digests cover 4096 stations of (x, y, half, heading, curvature) and
 * the 13 grid slots' (x, z, heading), rounded to 6 decimals.
 */
const APEX_PIN = {
  length: 594.738192324785,
  tightestRadius: 13.213900980374426,
  minHalf: 4.718144328147438,
  sampleDigest: '07b9df41a4e2ecf83dd657f67554880721ff9e8fd1d3d0f3b012a2da0c8bb6b9',
  gridDigest: '8b21ba6a596d32eb35e31d2ca0f171008383a19be1beba7dfde05f11d32c8f23',
}
{
  const apex = TRACKS.find((t) => t.id === 'apex-flats')
  if (!apex) {
    fail('APEX_FLATS pin', 'apex-flats is not in the catalog')
  } else {
    const { createHash } = await import('node:crypto')
    const L = buildTrackLine(apex)
    const near = (a, b) => Math.abs(a - b) < 1e-9
    if (near(L.length, APEX_PIN.length)) ok('APEX_FLATS length unchanged')
    else fail('APEX_FLATS length', `${L.length} != pinned ${APEX_PIN.length}`)

    let maxK = 0
    let minHalf = Infinity
    for (let d = 0; d < L.length; d += 0.5) {
      const p = L.at(d)
      maxK = Math.max(maxK, Math.abs(p.curvature))
      minHalf = Math.min(minHalf, p.half)
    }
    const radius = 1 / maxK
    if (near(radius, APEX_PIN.tightestRadius)) ok('APEX_FLATS tightest radius unchanged')
    else fail('APEX_FLATS tightest radius', `${radius} != pinned ${APEX_PIN.tightestRadius}`)
    if (near(minHalf, APEX_PIN.minHalf)) ok('APEX_FLATS min half-width unchanged')
    else fail('APEX_FLATS min half-width', `${minHalf} != pinned ${APEX_PIN.minHalf}`)

    const r = (v) => (Math.round(v * 1e6) / 1e6).toFixed(6)
    const h = createHash('sha256')
    for (let i = 0; i < 4096; i++) {
      const p = L.at((i / 4096) * L.length)
      h.update(`${r(p.x)},${r(p.y)},${r(p.half)},${r(p.heading)},${r(p.curvature)};`)
    }
    const dig = h.digest('hex')
    if (dig === APEX_PIN.sampleDigest) ok('APEX_FLATS sampled line digest unchanged')
    else fail('APEX_FLATS sampled digest', `${dig} != pinned ${APEX_PIN.sampleDigest}`)

    const g = createHash('sha256')
    for (let i = 0; i < 13; i++) {
      const s = gridSlot(L, i, apex.grid)
      g.update(`${r(s.x)},${r(s.z)},${r(s.heading)};`)
    }
    const gdig = g.digest('hex')
    if (gdig === APEX_PIN.gridDigest) ok('APEX_FLATS grid slots unchanged')
    else fail('APEX_FLATS grid digest', `${gdig} != pinned ${APEX_PIN.gridDigest}`)

    // The adapter's gate conversion must be sorted metres.
    const gates = trackGates(apex, L)
    const sorted = gates.every((v, i) => i === 0 || v > gates[i - 1])
    if (gates.length >= 2 && sorted && gates.every((v) => v > 0 && v < L.length)) ok('APEX_FLATS gates convert to sorted metres')
    else fail('APEX_FLATS gates', JSON.stringify(gates))
  }
}

/* ---- scenery scatter: generated props must be off the roadway ------------ */
console.log('scenery scatter')
for (const t of TRACKS) {
  const L = buildTrackLine(t)
  const first = scatterTrack(t, L)
  if (first.props.length <= t.scenery.count) {
    ok(`${t.id}: ${first.props.length}/${t.scenery.count} props placed (within budget)`)
  } else {
    fail(`${t.id} scatter budget`, `${first.props.length} > ${t.scenery.count}`)
  }
  const pad = SCENERY_CLEARANCE[t.scenery.kind]
  let bad = 0
  for (const p of first.props) {
    if (t.scenery.kind !== 'clouds' && !isClearOfRoad(L, p.x, p.z, pad)) bad++
    if (!isFinite(p.x) || !isFinite(p.z) || !isFinite(p.rot) || !isFinite(p.y)) bad++
  }
  if (bad === 0) ok(`${t.id}: every generated prop is off-road and finite`)
  else fail(`${t.id} scatter on-road`, `${bad} offending placement(s)`)

  let lmBad = 0
  for (const lm of first.landmarks) {
    if (!isClearOfRoad(L, lm.x, lm.z, 10)) lmBad++
  }
  if (lmBad === 0) ok(`${t.id}: landmarks clear of the road`)
  else fail(`${t.id} landmark clearance`, `${lmBad} offending landmark(s)`)

  const digest = (r) => {
    const h = createHash('sha256')
    for (const p of r.props) h.update(`${p.x.toFixed(4)},${p.z.toFixed(4)},${p.y.toFixed(4)},${p.rot.toFixed(4)},${p.scale.toFixed(4)},${p.variant.toFixed(4)};`)
    for (const p of r.landmarks) h.update(`L:${p.x.toFixed(4)},${p.z.toFixed(4)},${p.rot.toFixed(4)};`)
    return h.digest('hex')
  }
  const second = scatterTrack(t, L)
  if (digest(first) === digest(second)) ok(`${t.id}: scatter is deterministic`)
  else fail(`${t.id} scatter determinism`, 'two runs differ')
}

console.log('')
if (failures) {
  console.log(`MAP CHECK FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log('MAP CHECK PASSED')
