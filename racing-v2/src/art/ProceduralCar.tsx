/* Renders one car from a procedural archetype.
 *
 * Opponents must be indistinguishable from the player car at racing distance,
 * so every car -- player and AI alike -- comes through this component and
 * differs only in paint.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { bodyGeometry, canopyGeometry, materials, buildWheel, CARS } from './carGeometry'
import type { CarArchetype, CarMaterials } from './carGeometry'

/* Lofting a body is not cheap, and a full grid wants thirteen of them. The
 * loft depends only on the archetype, never on paint, so it is cached per
 * archetype and shared by every car on track. Thirteen cars therefore build
 * ONE body geometry between them, not thirteen.
 *
 * Module-level rather than useMemo because the cache must outlive any single
 * component and survive remounts; a car leaving the grid should not throw away
 * geometry the rest are still drawing. */
const geometryCache = new Map<string, { body: THREE.BufferGeometry; canopy: THREE.BufferGeometry }>()

function sharedGeometry(key: string, car: CarArchetype) {
  let g = geometryCache.get(key)
  if (!g) {
    g = { body: bodyGeometry(THREE, car), canopy: canopyGeometry(THREE, car) }
    geometryCache.set(key, g)
  }
  return g
}

export type ProceduralCarProps = {
  /** Archetype key, e.g. 'sport'. Falls back to 'sport' if unknown. */
  archetype?: string
  /** Paint override. Defaults to the archetype's own colour. */
  paint?: string
  /** Opponents at distance skip brake calipers and similar detail. */
  detailed?: boolean
  /** Build the car's own wheels. FALSE for the player car, whose wheels are
   *  separate physics bodies positioned by the raycast vehicle's suspension.
   *  Leaving this true there gives the car eight wheels: four drawn by the
   *  body and four more placed by the solver. */
  wheels?: boolean
}

/* The assembled car as a THREE.Group, memoised per (archetype, paint, detail).
 * Returned as a group rather than JSX because buildWheel already produces a
 * Group and re-expressing it as JSX would duplicate working code. */
export function useProceduralCar({ archetype = 'sport', paint, detailed = true, wheels = true }: ProceduralCarProps) {
  return useMemo(() => {
    const car = CARS[archetype] ?? CARS.sport
    const colour = paint ?? car.paint
    const geo = sharedGeometry(archetype, car)

    // Materials are per-car: paint is what distinguishes opponents, so these
    // are NOT shared. They are cheap next to the loft.
    const mats: CarMaterials = materials(THREE, colour, car.finish, null)

    /* ORIENTATION NORMALISED HERE, once, so no consumer has to think about it.
     *
     * racing3d.js lofts a car with its NOSE at negative z (noseY sits at the
     * most negative deckLine station). Upstream's raycast vehicle, whose
     * tuning this project keeps verbatim, puts the front axle at POSITIVE z
     * (vehicleConfig.front = +1.35). Rather than leave every call site to
     * discover that and apply its own correction -- which is how one of them
     * ends up with cars driving sideways -- the car is rotated once here so it
     * faces +Z, matching the vehicle convention.
     *
     * Consumers therefore get a car whose forward is +Z. The AI opponents,
     * whose force model works in local +X, rotate by +90 degrees about Y on
     * top of this. */
    const group = new THREE.Group()
    const oriented = new THREE.Group()
    oriented.rotation.y = Math.PI
    group.add(oriented)

    const body = new THREE.Mesh(geo.body, mats.paint)
    body.castShadow = true
    body.receiveShadow = true
    oriented.add(body)

    const canopy = new THREE.Mesh(geo.canopy, mats.glass)
    // No shadow from glass: it would cast a solid cabin-shaped shadow and the
    // car would look like it had a roof box.
    oriented.add(canopy)

    const w = car.wheel
    const halfBase = car.wheelbase / 2
    for (const [zi, z] of (wheels ? [-halfBase, halfBase] : []).entries()) {
      for (const side of [-1, 1] as const) {
        const wheel = buildWheel(THREE, mats, w, side, { details: detailed })
        wheel.position.set(side * w.track, w.y, z)
        // The nose sits at NEGATIVE z (racing3d.js puts noseY at the most
        // negative deckLine station), so the FRONT axle is z = -halfBase,
        // which is index 0 here. Naming them beats indexing by magic number,
        // and getting this backwards would put the steered wheels at the rear.
        wheel.name = `wheel-${zi === 0 ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}`
        oriented.add(wheel)
      }
    }

    return { group, car, materials: mats }
  }, [archetype, paint, detailed, wheels])
}

/** Drop-in mesh for a car. Position and rotation are the caller's business. */
export function ProceduralCar(props: ProceduralCarProps) {
  const { group } = useProceduralCar(props)
  return <primitive object={group} />
}

/** Archetype keys, for a car picker or for assigning opponents. */
export const ARCHETYPES = Object.keys(CARS)
