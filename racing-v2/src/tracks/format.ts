/* The FunSAT track format, v1: schema, parse and validation.
 *
 * Pure data and pure functions. No `three`, no React, no DOM -- the same
 * definitions run in the browser, in Node harnesses (tools/map-check.mjs) and
 * in review. The requirement document is docs/RACING_MAP_FORMAT_PLAN.md; the
 * tracks live in catalog.ts.
 *
 * WHY A VALIDATOR AT ALL. A circuit is the one asset whose failure mode is a
 * broken race rather than a visual glitch: a self-overlapping loop makes the
 * AI's local search latch onto the wrong part of the track, a corner tighter
 * than the driver's floor (KMAX_DEMAND = 0.09 rad/m) cannot be taken on the
 * line at any speed, and an unsafe grid puts a car on the grass at lights-out.
 * Each of those has cost real debugging in this project, so each is a hard,
 * named error here rather than a hope.
 *
 * The validator is deliberately strict and fails closed. Everything the brief
 * lists as a rejection case has a rule (table in the plan doc, §3).
 */
import { buildRacingLine, type RacingLine } from '../ai/racingLine'
import { gridSlot, type GridSpec } from '../ai/gridSlots'

export const FORMAT_TAG = 'funsat.track' as const
export const FORMAT_VERSION = 1 as const

export type WeatherId = 'dry' | 'wet' | 'rain'
export type SurfaceId = 'grass' | 'gravel' | 'salt' | 'shoulder' | 'cloud' | 'water'
export type SceneryKind =
  | 'pines' | 'redwoods' | 'containers' | 'clouds' | 'rocks'
  | 'solar' | 'sea' | 'dunes' | 'none'
export type LandmarkKind =
  | 'spire' | 'lighthouse' | 'arch' | 'mesa' | 'crane' | 'grandstand' | 'radiotower'
export type ThemeId = 'flats' | 'skyway' | 'harbor' | 'ridge' | 'salt' | 'causeway'

/* ---- themes --------------------------------------------------------------
 * A theme is the track's visual palette plus its light rig. It is data so the
 * validator can reject a track that references art the renderer cannot draw,
 * without dragging three.js into validation. The renderer (src/art/) maps each
 * id to the same procedural sky/ground/marking materials it already builds.
 */
export interface ThemeSpec {
  sky: { top: string; horizon: string; bottom: string }
  fog: { color: string; near: number; far: number }
  background: string
  ground: string
  road: string
  roadEdge: string
  roadCentre: string
  hemi: { sky: string; ground: string; intensity: number }
  key: { color: string; intensity: number }
  rim: { color: string; intensity: number }
}

export const THEMES: Record<ThemeId, ThemeSpec> = {
  /* The original circuit's look, unchanged from what shipped: a graded night
   * sky over a dark green plane. */
  flats: {
    sky: { top: '#2d4a66', horizon: '#8fa4bd', bottom: '#121820' },
    fog: { color: '#1b2434', near: 140, far: 460 },
    background: '#1b2434',
    ground: '#1d2a1f',
    road: '#3a3f47',
    roadEdge: '#e8e6df',
    roadCentre: '#d8d4c6',
    hemi: { sky: '#9fb3d4', ground: '#2a2e26', intensity: 0.45 },
    key: { color: '#ffffff', intensity: 1.45 },
    rim: { color: '#ffd9a8', intensity: 0.5 },
  },
  /* Prism Skyway: a road above a cloud deck in deep space. The fog far value
   * is large so the cloud sea reads as distance rather than a wall. */
  skyway: {
    sky: { top: '#140b2e', horizon: '#5a3fa0', bottom: '#05030f' },
    fog: { color: '#241a45', near: 120, far: 520 },
    background: '#241a45',
    ground: '#cfd6ff',
    road: '#4a4468',
    roadEdge: '#f4e8ff',
    roadCentre: '#b9a9ff',
    hemi: { sky: '#b8a6ff', ground: '#2a2450', intensity: 0.55 },
    key: { color: '#e8dcff', intensity: 1.35 },
    rim: { color: '#63e8ff', intensity: 0.6 },
  },
  /* Neon Harbor: night docks; deep blue with sodium/neon accents. */
  harbor: {
    sky: { top: '#0a1630', horizon: '#27508a', bottom: '#050a18' },
    fog: { color: '#0e1c38', near: 110, far: 430 },
    background: '#0e1c38',
    ground: '#101c2c',
    road: '#35393f',
    roadEdge: '#ffe9a8',
    roadCentre: '#7fd4ff',
    hemi: { sky: '#4a6fa8', ground: '#101820', intensity: 0.4 },
    key: { color: '#ffe2b0', intensity: 1.15 },
    rim: { color: '#4ad8ff', intensity: 0.7 },
  },
  /* Redwood Ridge: damp forest morning, low warm sun through the canopy. */
  ridge: {
    sky: { top: '#4a6f9e', horizon: '#c9b48a', bottom: '#2a3226' },
    fog: { color: '#8fa08a', near: 90, far: 400 },
    background: '#8fa08a',
    ground: '#33402a',
    road: '#4b4a44',
    roadEdge: '#e2ddc8',
    roadCentre: '#d8cfae',
    hemi: { sky: '#c8d6b8', ground: '#2c3224', intensity: 0.5 },
    key: { color: '#ffe8c0', intensity: 1.3 },
    rim: { color: '#a8c8e0', intensity: 0.4 },
  },
  /* Solar Salt Run: high desert noon; the palette is deliberately bleached. */
  salt: {
    sky: { top: '#4a86c8', horizon: '#cfe2ee', bottom: '#c8b890' },
    fog: { color: '#d8e4ea', near: 160, far: 520 },
    background: '#d8e4ea',
    ground: '#e4e0d2',
    road: '#8d8578',
    roadEdge: '#fffbe8',
    roadCentre: '#f0ead2',
    hemi: { sky: '#e8f0f8', ground: '#c8b890', intensity: 0.6 },
    key: { color: '#fff4dc', intensity: 1.6 },
    rim: { color: '#a8c8e8', intensity: 0.35 },
  },
  /* Tempest Causeway: North Atlantic weather, grey-green sea and stone. */
  causeway: {
    sky: { top: '#3a4a58', horizon: '#9aa8a8', bottom: '#26343a' },
    fog: { color: '#76888a', near: 100, far: 420 },
    background: '#76888a',
    ground: '#3a4a48',
    road: '#4a4e52',
    roadEdge: '#e0e2da',
    roadCentre: '#cfd2c8',
    hemi: { sky: '#a8bcc0', ground: '#2c3a38', intensity: 0.5 },
    key: { color: '#e8e4d4', intensity: 1.2 },
    rim: { color: '#8aa8c0', intensity: 0.45 },
  },
}

/* ---- surfaces ------------------------------------------------------------
 * Off the road, all four wheels are braked (the physics ground is one plane,
 * so this is the honest way to make the verge cost something). The brake force
 * band per surface is validated so a track cannot declare water that is
 * faster to cross than tarmac, or grass grippier than the road.
 */
export const SURFACE_BRAKE_BAND: Record<SurfaceId, readonly [number, number]> = {
  grass: [16, 28],
  gravel: [8, 20],
  salt: [14, 26],
  shoulder: [16, 30],
  cloud: [12, 24],
  water: [20, 34],
}

/* ---- track data ---------------------------------------------------------- */

export interface ControlPointDef {
  x: number
  y: number
  /** Road half-width at this control point, metres. */
  half: number
  /** Reserved: elevation, metres. v1 runtime is flat; any non-zero value is a
   *  hard validation error, not a silent flatten. */
  ele?: number
  /** Reserved: banking, favouring one edge. Same rule as ele. */
  bank?: number
}

export interface SurfaceSpec {
  offroad: SurfaceId
  /** Brake force applied to all four wheels off the road. */
  brake: number
}

export interface HazardSpec {
  kind: 'gravel-trap' | 'puddle'
  /** Where the zone starts, as a fraction of length. */
  atFraction: number
  /** Zone length, as a fraction of length. */
  lengthFraction: number
  side: 'left' | 'right' | 'both'
}

export interface LandmarkSpec {
  name: string
  kind: LandmarkKind
  atFraction: number
  side: 'left' | 'right'
  /** Metres beyond the road edge. Must clear the road plus runoff. */
  offset: number
  scale?: number
}

export interface ScenerySpec {
  kind: SceneryKind
  /** Instance budget. The generator must not exceed it. */
  count: number
  tier: 'low' | 'mid' | 'high'
}

export interface AiSpec {
  /** Planning fraction of grip, from tools/calibrate-corner-budget.mjs. */
  cornerBudget: number
  /** Top speed in m/s, from tools/speed-envelope.mjs. */
  topSpeed: number
}

export interface TrackDefinition {
  format: typeof FORMAT_TAG
  version: typeof FORMAT_VERSION
  id: string
  name: string
  blurb: string
  theme: ThemeId
  difficulty: 1 | 2 | 3
  seed: string
  /** 'forward' only in v1; the control point order defines travel direction. */
  direction: 'forward'
  centerline: ControlPointDef[]
  /** Ordered anti-shortcut gates, fractions of length in (0,1). */
  checkpoints: number[]
  grid: GridSpec
  surface: SurfaceSpec
  hazards: HazardSpec[]
  landmarks: LandmarkSpec[]
  scenery: ScenerySpec
  weather: WeatherId[]
  ai: AiSpec
  provenance: { origin: 'original'; license: 'CC0-1.0'; note: string }
}

/* ---- limits -------------------------------------------------------------- */

export const CAPS = {
  controlPoints: { min: 8, max: 48 },
  half: [4, 14] as const,
  trackLength: [400, 1100] as const,
  minRadius: 12.5,
  gateRadius: 18,
  gateMargin: 4,
  minGateGap: 25,
  minGateGapFraction: 0.05,
  /* Slots must not spawn mid-hairpin, but the existing, fully-raced APEX_FLATS
   * grid extends 7.6 m into a ~19 m final corner and has passed every race
   * harness -- so the honest threshold is "no tighter than a checkpoint",
   * not "straight only". An earlier value of 40 m was this validator's
   * invention, and it rejected the shipped circuit: the schema was wrong, not
   * the circuit. */
  gridRadius: 18,
  gridClearance: 0.6,
  slotSeparation: 4.6,
  landmarkOffset: 14,
  landmarks: 6,
  hazards: 12,
  sceneryTierCap: { low: 160, mid: 320, high: 560 } as const,
  topSpeed: [18, 60] as const,
  /* Upper bound guards against nonsense, not against measurement: the
   * calibration harness is what proves a value, and solar-salt-run's roomy
   * geometry measures 0.65. Anything approaching 1.0 would plan at the grip
   * limit, which no measured track does. */
  cornerBudget: [0.1, 0.7] as const,
  carHalfWidth: 0.9,
  carLength: 4.3,
  /** Entries on the largest grid this app supports (1 player + 12 opponents). */
  maxSlots: 13,
}

const ID_RE = /^[a-z][a-z0-9-]{2,31}$/

function finite(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/* ---- parse: structural validation of unknown input -----------------------
 * Anything can be placed in localStorage or fetched as JSON; parseTrack is the
 * boundary that has to cope with all of it. It reports errors rather than
 * throwing, because the game's fallback path needs a reason, not an exception.
 */
export interface ParseResult {
  ok: boolean
  errors: string[]
  def: TrackDefinition | null
}

export function parseTrack(input: unknown): ParseResult {
  const errors: string[] = []
  const bad = (msg: string) => errors.push(`[malformed] ${msg}`)

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['[malformed] track must be an object'], def: null }
  }
  const t = input as Record<string, unknown>

  if (t.format !== FORMAT_TAG) bad(`format must be "${FORMAT_TAG}"`)
  if (t.version !== FORMAT_VERSION) bad(`version must be ${FORMAT_VERSION}`)
  if (typeof t.id !== 'string' || !ID_RE.test(t.id)) bad('id must match /^[a-z][a-z0-9-]{2,31}$/')
  if (typeof t.name !== 'string' || t.name.length < 2 || t.name.length > 40) bad('name must be 2..40 chars')
  if (typeof t.blurb !== 'string' || t.blurb.length < 4 || t.blurb.length > 120) bad('blurb must be 4..120 chars')
  if (typeof t.theme !== 'string' || !(t.theme in THEMES)) bad('theme must be a known theme id')
  if (t.difficulty !== 1 && t.difficulty !== 2 && t.difficulty !== 3) bad('difficulty must be 1, 2 or 3')
  if (typeof t.seed !== 'string' || t.seed.length < 3) bad('seed must be a string of at least 3 chars')
  if (t.direction !== 'forward') bad('direction must be "forward" (reverse is not supported in v1)')

  if (!Array.isArray(t.centerline)) bad('centerline must be an array')
  else {
    for (let i = 0; i < t.centerline.length; i++) {
      const p = t.centerline[i] as Record<string, unknown>
      if (typeof p !== 'object' || p === null) { bad(`centerline[${i}] must be an object`); continue }
      for (const k of ['x', 'y', 'half'] as const) {
        if (!finite(p[k])) bad(`centerline[${i}].${k} must be a finite number`)
      }
      if (p.ele !== undefined && !finite(p.ele)) bad(`centerline[${i}].ele must be a finite number when present`)
      if (p.bank !== undefined && !finite(p.bank)) bad(`centerline[${i}].bank must be a finite number when present`)
    }
  }

  if (!Array.isArray(t.checkpoints) || !t.checkpoints.every(finite)) bad('checkpoints must be an array of finite numbers')

  const grid = t.grid as Record<string, unknown> | undefined
  if (typeof grid !== 'object' || grid === null) bad('grid must be an object')
  else for (const k of ['rowGap', 'stagger', 'lateral', 'setback', 'rows'] as const) {
    if (!finite(grid[k])) bad(`grid.${k} must be a finite number`)
  }

  const surface = t.surface as Record<string, unknown> | undefined
  if (typeof surface !== 'object' || surface === null) bad('surface must be an object')
  else {
    if (typeof surface.offroad !== 'string' || !(surface.offroad in SURFACE_BRAKE_BAND)) bad('surface.offroad must be a known surface id')
    if (!finite(surface.brake)) bad('surface.brake must be a finite number')
  }

  if (!Array.isArray(t.hazards)) bad('hazards must be an array')
  else for (let i = 0; i < t.hazards.length; i++) {
    const h = t.hazards[i] as Record<string, unknown>
    if (typeof h !== 'object' || h === null) { bad(`hazards[${i}] must be an object`); continue }
    if (h.kind !== 'gravel-trap' && h.kind !== 'puddle') bad(`hazards[${i}].kind unknown`)
    if (!finite(h.atFraction) || !finite(h.lengthFraction)) bad(`hazards[${i}] fractions must be finite`)
    if (h.side !== 'left' && h.side !== 'right' && h.side !== 'both') bad(`hazards[${i}].side invalid`)
  }

  if (!Array.isArray(t.landmarks)) bad('landmarks must be an array')
  else for (let i = 0; i < t.landmarks.length; i++) {
    const l = t.landmarks[i] as Record<string, unknown>
    if (typeof l !== 'object' || l === null) { bad(`landmarks[${i}] must be an object`); continue }
    if (typeof l.name !== 'string') bad(`landmarks[${i}].name must be a string`)
    if (typeof l.kind !== 'string') bad(`landmarks[${i}].kind must be a string`)
    if (!finite(l.atFraction) || !finite(l.offset)) bad(`landmarks[${i}] atFraction/offset must be finite`)
    if (l.side !== 'left' && l.side !== 'right') bad(`landmarks[${i}].side invalid`)
  }

  const scenery = t.scenery as Record<string, unknown> | undefined
  if (typeof scenery !== 'object' || scenery === null) bad('scenery must be an object')
  else {
    if (typeof scenery.kind !== 'string') bad('scenery.kind must be a string')
    if (!finite(scenery.count)) bad('scenery.count must be a finite number')
    if (scenery.tier !== 'low' && scenery.tier !== 'mid' && scenery.tier !== 'high') bad('scenery.tier invalid')
  }

  if (!Array.isArray(t.weather) || t.weather.length === 0) bad('weather must be a non-empty array')
  else for (const w of t.weather) if (w !== 'dry' && w !== 'wet' && w !== 'rain') bad(`weather id "${String(w)}" unknown`)

  const ai = t.ai as Record<string, unknown> | undefined
  if (typeof ai !== 'object' || ai === null) bad('ai must be an object')
  else {
    if (!finite(ai.cornerBudget)) bad('ai.cornerBudget must be a finite number')
    if (!finite(ai.topSpeed)) bad('ai.topSpeed must be a finite number')
  }

  const prov = t.provenance as Record<string, unknown> | undefined
  if (typeof prov !== 'object' || prov === null) bad('provenance must be an object')
  else if (prov.origin !== 'original' || prov.license !== 'CC0-1.0') bad('provenance must be origin "original" under CC0-1.0')

  if (errors.length) return { ok: false, errors, def: null }
  return { ok: true, errors: [], def: input as TrackDefinition }
}

/* ---- validate: semantic + geometric rules -------------------------------- */

/** Named machine codes, so tests assert reasons rather than prose. */
export const ERR = {
  loop: 'malformed-loop',
  radius: 'undriveable-radius',
  width: 'illegal-width',
  selfCross: 'self-intersection',
  checkpoint: 'invalid-checkpoint',
  grid: 'invalid-grid',
  scenery: 'on-road-scenery',
  propBudget: 'prop-budget',
  unsupported: 'unsupported-feature',
  surface: 'illegal-surface',
  hazard: 'invalid-hazard',
  ai: 'invalid-ai',
  duplicate: 'duplicate-id',
  theme: 'unsupported-theme',
} as const

function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Validate one track. `existingIds` lets a registry pass all other ids in
 *  scope so duplicates are caught in the same pass. */
export function validateTrack(def: TrackDefinition, existingIds: readonly string[] = []): string[] {
  const errs: string[] = []
  const err = (code: string, msg: string) => errs.push(`[${code}] ${def.id}: ${msg}`)

  if (existingIds.includes(def.id)) err(ERR.duplicate, `id "${def.id}" is already used`)
  if (!(def.theme in THEMES)) err(ERR.theme, `theme "${def.theme}" is not in the registry`)

  // ---- reserved features, rejected rather than ignored -------------------
  for (let i = 0; i < def.centerline.length; i++) {
    const p = def.centerline[i]
    if (p.ele !== undefined && p.ele !== 0) err(ERR.unsupported, `centerline[${i}].ele=${p.ele} — elevation is not supported in runtime v1`)
    if (p.bank !== undefined && p.bank !== 0) err(ERR.unsupported, `centerline[${i}].bank=${p.bank} — banking is not supported in runtime v1`)
  }
  if (def.direction !== 'forward') err(ERR.unsupported, 'only direction "forward" is supported')

  // ---- control point sanity ----------------------------------------------
  const n = def.centerline.length
  if (n < CAPS.controlPoints.min || n > CAPS.controlPoints.max) {
    err(ERR.loop, `needs ${CAPS.controlPoints.min}..${CAPS.controlPoints.max} control points, has ${n}`)
    return errs // geometry checks below need a usable loop
  }
  for (let i = 0; i < n; i++) {
    const p = def.centerline[i]
    if (!finite(p.x) || !finite(p.y) || !finite(p.half)) { err(ERR.loop, `control point ${i} has a non-finite value`); return errs }
    if (p.half < CAPS.half[0] || p.half > CAPS.half[1]) err(ERR.width, `control point ${i} half=${p.half} outside ${CAPS.half[0]}..${CAPS.half[1]}`)
    const q = def.centerline[(i + 1) % n]
    const gap = Math.hypot(q.x - p.x, q.y - p.y)
    if (gap < 3) err(ERR.loop, `control points ${i} and ${i + 1} are ${gap.toFixed(2)} m apart (zero-length segment)`)
  }
  {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of def.centerline) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    if (maxX - minX < 30 || maxY - minY < 30) err(ERR.loop, `bounding box ${(maxX - minX).toFixed(0)}x${(maxY - minY).toFixed(0)} m is too small for a circuit`)
  }

  // ---- grid spec ranges ---------------------------------------------------
  const g = def.grid
  if (!(g.rows >= Math.ceil(CAPS.maxSlots / 2) && g.rows <= 9)) err(ERR.grid, `rows=${g.rows} does not cover a 13-car grid`)
  if (!(g.setback >= 3 && g.setback <= 20)) err(ERR.grid, `setback=${g.setback} outside 3..20`)
  if (!(g.rowGap >= CAPS.carLength && g.rowGap <= 12)) err(ERR.grid, `rowGap=${g.rowGap} outside ${CAPS.carLength}..12`)
  if (!(g.stagger >= 0 && g.stagger <= 4)) err(ERR.grid, `stagger=${g.stagger} outside 0..4`)
  if (!(g.lateral >= 1.4 && g.lateral <= 3.6)) err(ERR.grid, `lateral=${g.lateral} outside 1.4..3.6`)

  // ---- surface ------------------------------------------------------------
  const band = SURFACE_BRAKE_BAND[def.surface.offroad]
  if (!band) err(ERR.surface, `unknown surface "${def.surface.offroad}"`)
  else if (def.surface.brake < band[0] || def.surface.brake > band[1]) {
    err(ERR.surface, `brake=${def.surface.brake} outside ${def.surface.offroad} band ${band[0]}..${band[1]}`)
  }

  // ---- scenery budget -----------------------------------------------------
  const cap = CAPS.sceneryTierCap[def.scenery.tier]
  if (!Number.isInteger(def.scenery.count) || def.scenery.count < 0) err(ERR.propBudget, 'scenery.count must be a non-negative integer')
  else if (def.scenery.count > cap) err(ERR.propBudget, `scenery.count=${def.scenery.count} exceeds ${def.scenery.tier} cap ${cap}`)
  else if (def.scenery.kind !== 'none' && def.scenery.count < 24) err(ERR.propBudget, `scenery.count=${def.scenery.count} is too sparse to be scenery (min 24)`)
  if (def.scenery.kind === 'none' && def.scenery.count !== 0) err(ERR.propBudget, 'scenery kind "none" must declare count 0')
  if (def.landmarks.length > CAPS.landmarks) err(ERR.propBudget, `${def.landmarks.length} landmarks exceeds ${CAPS.landmarks}`)
  if (def.hazards.length > CAPS.hazards) err(ERR.propBudget, `${def.hazards.length} hazards exceeds ${CAPS.hazards}`)

  // ---- ai numbers (ranges only; the harnesses own the values) -------------
  if (def.ai.cornerBudget < CAPS.cornerBudget[0] || def.ai.cornerBudget > CAPS.cornerBudget[1]) {
    err(ERR.ai, `cornerBudget=${def.ai.cornerBudget} outside ${CAPS.cornerBudget[0]}..${CAPS.cornerBudget[1]}`)
  }
  if (def.ai.topSpeed < CAPS.topSpeed[0] || def.ai.topSpeed > CAPS.topSpeed[1]) {
    err(ERR.ai, `topSpeed=${def.ai.topSpeed} outside ${CAPS.topSpeed[0]}..${CAPS.topSpeed[1]}`)
  }

  // ---- weather ------------------------------------------------------------
  if (!def.weather.includes('dry')) err(ERR.surface, 'weather must include "dry"')
  if (new Set(def.weather).size !== def.weather.length) err(ERR.surface, 'weather contains duplicates')

  // ---- geometry -----------------------------------------------------------
  let line: RacingLine
  try {
    line = buildRacingLine(def.centerline, 32)
  } catch (e) {
    err(ERR.loop, `buildRacingLine threw: ${(e as Error).message}`)
    return errs
  }
  const L = line.length
  if (L < CAPS.trackLength[0] || L > CAPS.trackLength[1]) err(ERR.loop, `length ${L.toFixed(0)} m outside ${CAPS.trackLength[0]}..${CAPS.trackLength[1]}`)

  let maxK = 0
  let minHalf = Infinity
  let finiteEverything = true
  for (let d = 0; d < L; d += 0.5) {
    const p = line.at(d)
    if (!finite(p.x) || !finite(p.y) || !finite(p.heading) || !finite(p.curvature) || !finite(p.half)) { finiteEverything = false; break }
    maxK = Math.max(maxK, Math.abs(p.curvature))
    minHalf = Math.min(minHalf, p.half)
  }
  if (!finiteEverything) err(ERR.loop, 'sampled line contains a non-finite value')
  else {
    if (minHalf < CAPS.half[0] - 0.5) err(ERR.width, `spline interpolates half-width down to ${minHalf.toFixed(2)} m`)
    const tightest = maxK > 0 ? 1 / maxK : Infinity
    if (tightest < CAPS.minRadius) err(ERR.radius, `tightest radius ${tightest.toFixed(1)} m is under the ${CAPS.minRadius} m floor`)
  }

  // ---- self-intersection --------------------------------------------------
  {
    const step = 4
    const pts: { x: number; y: number; half: number; d: number }[] = []
    for (let d = 0; d < L; d += step) {
      const p = line.at(d)
      pts.push({ x: p.x, y: p.y, half: p.half, d })
    }
    outer: for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j]
        const arc = Math.abs(a.d - b.d)
        const circArc = Math.min(arc, L - arc)
        // Points that are close ALONG the road are neighbours by definition;
        // only a fold that brings distant parts of the circuit together is a
        // fault. The threshold leaves room for legitimate hairpins, where the
        // two arms of a 180-degree turn pass beside each other.
        if (circArc < a.half + b.half + 6) continue
        const gap = Math.hypot(a.x - b.x, a.y - b.y)
        if (gap < a.half + b.half + 2) {
          err(ERR.selfCross, `road overlaps itself near ${a.d.toFixed(0)} m and ${b.d.toFixed(0)} m (centreline gap ${gap.toFixed(1)} m)`)
          break outer
        }
      }
    }
  }

  // ---- checkpoints --------------------------------------------------------
  const cps = def.checkpoints
  if (cps.length < 2) err(ERR.checkpoint, `needs at least 2 checkpoints, has ${cps.length}`)
  if (cps.length > 8) err(ERR.checkpoint, `${cps.length} checkpoints exceeds 8`)
  for (let i = 0; i < cps.length; i++) {
    const f = cps[i]
    if (!finite(f) || f <= 0 || f >= 1) { err(ERR.checkpoint, `checkpoint ${i} fraction ${f} is not in (0,1)`); continue }
    if (i > 0 && f <= cps[i - 1]) err(ERR.checkpoint, `checkpoint ${i} (${f}) is not after checkpoint ${i - 1} (${cps[i - 1]})`)
  }
  let lastGridBack = 0
  for (let i = 0; i < CAPS.maxSlots; i++) {
    const s = gridSlot(line, i, g)
    const back = (L - s.distance) % L
    lastGridBack = Math.max(lastGridBack, back)
  }
  if (lastGridBack > Math.min(80, L * 0.22)) err(ERR.grid, `grid extends ${lastGridBack.toFixed(0)} m back from the line`)
  for (let i = 0; i < cps.length; i++) {
    const d = cps[i] * L
    if (d < lastGridBack + CAPS.minGateGap) err(ERR.checkpoint, `gate ${i} at ${d.toFixed(0)} m sits in the grid zone (ends ${lastGridBack.toFixed(0)} m)`)
    if (d > L - CAPS.minGateGap) err(ERR.checkpoint, `gate ${i} at ${d.toFixed(0)} m is too close to the finish line`)
    if (i > 0) {
      const prev = cps[i - 1] * L
      const gap = d - prev
      if (gap < Math.max(CAPS.minGateGap, CAPS.minGateGapFraction * L)) {
        const minGap = Math.max(CAPS.minGateGap, CAPS.minGateGapFraction * L)
        err(ERR.checkpoint, `gates ${i - 1} and ${i} are ${gap.toFixed(0)} m apart (min ${minGap.toFixed(0)} m)`)
      }
    }
    const k = Math.abs(line.at(d).curvature)
    const r = k > 1e-6 ? 1 / k : Infinity
    if (r < CAPS.gateRadius) err(ERR.checkpoint, `gate ${i} sits in a ${r.toFixed(0)} m corner (needs ${CAPS.gateRadius} m so the on-road gate test is honest)`)
  }
  // Last-to-first (wrapping) spacing: the line crossing between them is the
  // finish gate itself, so only comment, do not enforce beyond the guard above.

  // ---- grid safety --------------------------------------------------------
  {
    const slots: { x: number; z: number; half: number; back: number }[] = []
    for (let i = 0; i < CAPS.maxSlots; i++) {
      const s = gridSlot(line, i, g)
      const p = line.at(s.distance)
      const back = (L - s.distance) % L
      slots.push({ x: s.x, z: s.z, half: p.half, back })
      const clearance = Math.abs(s.lateral) + CAPS.carHalfWidth + CAPS.gridClearance
      if (clearance > p.half) {
        err(ERR.grid, `slot ${i} needs ${clearance.toFixed(1)} m of half-width, road has ${p.half.toFixed(1)} m`)
      }
      const k = Math.abs(p.curvature)
      if (k > 1e-6 && 1 / k < CAPS.gridRadius) {
        err(ERR.grid, `slot ${i} sits in a ${(1 / k).toFixed(0)} m corner (needs ${CAPS.gridRadius} m)`)
      }
    }
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i], b = slots[j]
        const gap = Math.hypot(a.x - b.x, a.z - b.z)
        if (gap < CAPS.slotSeparation) err(ERR.grid, `slots ${i} and ${j} are ${gap.toFixed(2)} m apart (min ${CAPS.slotSeparation} m)`)
      }
    }
  }

  // ---- hazards ------------------------------------------------------------
  for (let i = 0; i < def.hazards.length; i++) {
    const h = def.hazards[i]
    if (h.atFraction < 0.03 || h.atFraction > 0.97) err(ERR.hazard, `hazard ${i} starts at ${h.atFraction}, outside 0.03..0.97`)
    if (h.lengthFraction < 0.01 || h.lengthFraction > 0.25) err(ERR.hazard, `hazard ${i} length ${h.lengthFraction} outside 0.01..0.25`)
    if (h.atFraction * L < lastGridBack + 10) err(ERR.hazard, `hazard ${i} overlaps the grid zone`)
    if ((h.atFraction + h.lengthFraction) * L > L - 10) err(ERR.hazard, `hazard ${i} runs into the finish line`)
    if (h.kind === 'puddle' && !def.weather.some((w) => w === 'wet' || w === 'rain')) {
      err(ERR.hazard, `puddle hazard ${i} on a track that never runs wet weather`)
    }
  }

  // ---- landmarks off the road --------------------------------------------
  for (let i = 0; i < def.landmarks.length; i++) {
    const l = def.landmarks[i]
    if (l.name.length < 2 || l.name.length > 24) err(ERR.scenery, `landmark ${i} name must be 2..24 chars`)
    if (!['spire', 'lighthouse', 'arch', 'mesa', 'crane', 'grandstand', 'radiotower'].includes(l.kind)) {
      err(ERR.scenery, `landmark ${i} kind "${l.kind}" unknown`)
    }
    if (l.atFraction < 0 || l.atFraction > 1) err(ERR.scenery, `landmark ${i} atFraction outside 0..1`)
    if (l.offset < CAPS.landmarkOffset) err(ERR.scenery, `landmark ${i} offset ${l.offset} closer than ${CAPS.landmarkOffset} m from the road edge`)
    if (l.scale !== undefined && (l.scale < 0.4 || l.scale > 3)) err(ERR.scenery, `landmark ${i} scale outside 0.4..3`)
  }

  return errs
}

/** Validate a catalog: parse-shape already assumed; ids must be unique and the
 *  default id must exist. Returns [] when the whole registry is sound. */
export function validateCatalog(tracks: readonly TrackDefinition[], defaultId?: string): string[] {
  const errs: string[] = []
  const seen: string[] = []
  for (const t of tracks) {
    errs.push(...validateTrack(t, seen))
    seen.push(t.id)
  }
  if (defaultId !== undefined && !seen.includes(defaultId)) errs.push(`[malformed] default track "${defaultId}" is not in the catalog`)
  if (seen.length > 0 && new Set(seen).size !== seen.length) errs.push('[duplicate-id] catalog contains duplicate ids')
  return errs
}

/** Convenience for consumers that want a clamped value from a spec. */
export function clampAi(def: TrackDefinition): { cornerBudget: number; topSpeed: number } {
  return {
    cornerBudget: clamp(def.ai.cornerBudget, CAPS.cornerBudget[0], CAPS.cornerBudget[1]),
    topSpeed: clamp(def.ai.topSpeed, CAPS.topSpeed[0], CAPS.topSpeed[1]),
  }
}

export { angleDelta }
