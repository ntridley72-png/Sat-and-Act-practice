/* Boundary types for the ported procedural geometry in carGeometry.js.
 *
 * The implementation is deliberately untyped JS (see that file's header). This
 * declaration is the contract the rest of the TypeScript app codes against, so
 * strict mode still catches misuse at every call site even though the maths
 * inside is unchecked.
 */
import type * as THREE from 'three'

/** One wheel's dimensions, in metres. `track` is the half-track: the lateral
 *  distance from the car's centreline to the wheel centre. */
export interface WheelSpec {
  radius: number
  width: number
  spokes: number
  track: number
  y: number
}

/** A car archetype: the parameter set from which a body is lofted. Field names
 *  are preserved from racing3d.js so the two stay comparable. Only the fields
 *  this app reads are declared; the loft reads more. */
export interface CarArchetype {
  name: string
  paint: string
  finish: 'gloss' | 'metallic' | 'pearl' | 'matte' | 'chrome'
  len: number
  wid: number
  widR: number
  wheelbase: number
  baseY: number
  beltY: number
  roofY: number
  wheel: WheelSpec
  [key: string]: unknown
}

export interface CarMaterials {
  paint: THREE.MeshPhysicalMaterial
  glass: THREE.MeshPhysicalMaterial
  chrome: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  trim: THREE.MeshStandardMaterial
  tire: THREE.MeshStandardMaterial
  rim: THREE.MeshStandardMaterial
  rimDark: THREE.MeshStandardMaterial
  disc: THREE.MeshStandardMaterial
  caliper: THREE.MeshStandardMaterial
  tail: THREE.MeshStandardMaterial
  head: THREE.MeshStandardMaterial
  amber: THREE.MeshStandardMaterial
  interior: THREE.MeshStandardMaterial
  seat: THREE.MeshStandardMaterial
  orange: THREE.MeshStandardMaterial
}

/** The twelve generational archetypes. Keys are stable identifiers. */
export declare const CARS: Record<string, CarArchetype>

/** Loft the body shell from the archetype's station profile. */
export declare function bodyGeometry(three: typeof THREE, car: CarArchetype): THREE.BufferGeometry

/** Loft the greenhouse (cabin glass) as a separate shell. */
export declare function canopyGeometry(three: typeof THREE, car: CarArchetype): THREE.BufferGeometry

/** Build the PBR material set for a paint colour and finish. `env` may be null;
 *  the materials simply render without reflections. */
export declare function materials(
  three: typeof THREE,
  paintHex: string,
  finish: CarArchetype['finish'],
  env: THREE.Texture | null,
): CarMaterials

/** Build one wheel. `side` is -1 or +1 and mirrors the dished rim face. */
export declare function buildWheel(
  three: typeof THREE,
  m: CarMaterials,
  spec: WheelSpec,
  side: -1 | 1,
  opts?: { details?: boolean },
): THREE.Group

export declare function buildStations(car: CarArchetype): number[][]
export declare function ringShaped(
  w: number, y0: number, y1: number,
  sillW: number, shoulderW: number, deckW: number, creaseY: number,
): number[][]
export declare function loftGeometry(three: typeof THREE, rings: number[][][]): THREE.BufferGeometry
