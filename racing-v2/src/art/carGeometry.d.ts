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

/** Add lights, wings, exhausts, vents, splitters and trim to an assembled car
 *  group. The archetype table already declares these per car (signature,
 *  wing, exhaust, vents, popups), so omitting this call throws that detail
 *  away and leaves a smooth, unconvincing shell. */
export declare function addDetails(
  three: typeof THREE,
  car: CarArchetype,
  group: THREE.Group,
  m: CarMaterials,
  spec: CarArchetype & { key?: string },
): void

export declare function boxPart(
  three: typeof THREE,
  m: CarMaterials,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  mat: THREE.Material,
  rx?: number, ry?: number,
): THREE.Mesh

/** Build a PMREM environment map from a procedurally drawn canvas. No image
 *  file is involved: the sky, the key light and the ground are painted as
 *  gradients and radial blobs in code, which is what keeps the reflections
 *  original. Returns null if PMREM is unavailable. */
export declare function makeEnvTexture(
  three: typeof THREE,
  renderer: THREE.WebGLRenderer,
  accent: string | null,
  pmrem: THREE.PMREMGenerator,
): THREE.Texture | null

export declare function envSceneCanvas(accent: string | null): HTMLCanvasElement

export declare function buildStations(car: CarArchetype): number[][]
export declare function ringShaped(
  w: number, y0: number, y1: number,
  sillW: number, shoulderW: number, deckW: number, creaseY: number,
): number[][]
export declare function loftGeometry(three: typeof THREE, rings: number[][][]): THREE.BufferGeometry
