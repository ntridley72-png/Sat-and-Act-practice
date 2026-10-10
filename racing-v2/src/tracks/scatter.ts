/* Deterministic scenery placement.
 *
 * Pure functions, no three.js: the renderer turns placements into instanced
 * meshes, and tools/map-check.mjs runs the SAME generator to prove every
 * generated prop sits off the roadway. A generator that cannot be checked is
 * a generator that will eventually put a pine in the racing line.
 *
 * OFF-ROAD IS A CONTRACT, NOT A SIDE EFFECT. Every placement is retried (and
 * skipped if it keeps failing) against the whole centreline, not just the
 * local lateral offset: at a hairpin, a prop 40 m to the inside of one arm
 * can sit directly on the other arm. Checking against every sample catches
 * that; checking only `lateral > half + clearance` does not.
 */
import { createStream } from '../ai/random'
import type { RacingLine } from '../ai/racingLine'
import type { SceneryKind, TrackDefinition } from './format'

export interface PropPlacement {
  /** World x. */
  x: number
  /** World z (the AI's y). */
  z: number
  /** Height above the ground plane, metres. Clouds float below zero. */
  y: number
  /** Yaw, radians. Applied to boxes along their long axis. */
  rot: number
  scale: number
  /** 0..1 deterministic variant, for colour/shape selection. */
  variant: number
}

export interface LandmarkPlacement {
  x: number
  z: number
  rot: number
  scale: number
  kind: string
  name: string
}

export interface ScatterResult {
  props: PropPlacement[]
  landmarks: LandmarkPlacement[]
}

/** Minimum clearance beyond the road edge, per scenery kind. */
export const SCENERY_CLEARANCE: Record<SceneryKind, number> = {
  pines: 6,
  redwoods: 8,
  containers: 8,
  clouds: 6,
  rocks: 5,
  solar: 10,
  sea: 10,
  dunes: 6,
  none: 0,
}

/** How far beyond the clearance props may scatter. */
const SPREAD: Record<SceneryKind, number> = {
  pines: 45,
  redwoods: 55,
  containers: 34,
  clouds: 120,
  rocks: 50,
  solar: 64,
  sea: 90,
  dunes: 60,
  none: 0,
}

/** Is (x, z) clear of the whole road by `pad` metres beyond its edge? */
export function isClearOfRoad(line: RacingLine, x: number, z: number, pad: number): boolean {
  // Dense enough that a prop cannot slip between samples even on a long
  // track: 640 stations is at most ~1.7 m apart. The 1 m safety adder covers
  // the interpolation between stations.
  const samples = 640
  const need = pad + 1
  for (let i = 0; i < samples; i++) {
    const p = line.at((i / samples) * line.length)
    const gap = (p.x - x) ** 2 + (p.y - z) ** 2
    const r = p.half + need
    if (gap < r * r) return false
  }
  return true
}

export function scatterTrack(def: TrackDefinition, line: RacingLine): ScatterResult {
  const kind = def.scenery.kind
  const props: PropPlacement[] = []
  const landmarks: LandmarkPlacement[] = []

  if (kind !== 'none' && def.scenery.count > 0) {
    const rng = createStream(`${def.seed}:scatter`)
    const clearance = SCENERY_CLEARANCE[kind]
    const spread = SPREAD[kind]
    const L = line.length

    for (let i = 0; i < def.scenery.count; i++) {
      // Deterministic, evenly spread along the loop with jitter, so no long
      // barren stretch and no accidental clump at one distance.
      const d = (((i + rng.float(0.15, 0.85)) / def.scenery.count) * L) % L
      const p = line.at(d)
      const nx = -Math.sin(p.heading)
      const nz = Math.cos(p.heading)
      // Clouds favour below-road heights; everything else sits on the plane.
      const y = kind === 'clouds' ? -rng.float(6, 42) : 0
      const scale = kind === 'pines' ? rng.float(0.7, 1.4)
        : kind === 'redwoods' ? rng.float(0.8, 1.3)
        : kind === 'clouds' ? rng.float(5, 17)
        : kind === 'rocks' ? rng.float(0.8, 4.5)
        : kind === 'dunes' ? rng.float(1, 5)
        : 1
      const variant = rng.next()

      let placed = false
      for (let attempt = 0; attempt < 4 && !placed; attempt++) {
        const side = rng.chance(0.5) ? 1 : -1
        const lateral = (p.half + clearance + rng.float(0, spread)) * side
        const x = p.x + nx * lateral
        const z = p.y + nz * lateral
        // Clouds float clear of the plane, so their footprint may overlap the
        // road; everything solid must clear it by its own footprint radius.
        const pad = kind === 'clouds' ? 0 : clearance + scale * 0.5
        if (kind === 'clouds' || isClearOfRoad(line, x, z, pad)) {
          props.push({ x, z, y, rot: -p.heading, scale, variant })
          placed = true
        }
      }
      // A skipped prop is allowed: count is a budget, not a promise. The
      // harness reports how many survived so a track cannot silently lose
      // most of its scenery.
    }
  }

  for (const l of def.landmarks) {
    const d = ((l.atFraction % 1) + 1) % 1 * line.length
    const p = line.at(d)
    const nx = -Math.sin(p.heading)
    const nz = Math.cos(p.heading)
    const side = l.side === 'left' ? 1 : -1
    const lateral = (p.half + l.offset) * side
    landmarks.push({
      x: p.x + nx * lateral,
      z: p.y + nz * lateral,
      rot: -p.heading,
      scale: l.scale ?? 1,
      kind: l.kind,
      name: l.name,
    })
  }

  return { props, landmarks }
}
