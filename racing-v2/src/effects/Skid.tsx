/* Skid marks.
 *
 * A fixed-size ring of instanced quads laid flat on the road. Instanced and
 * pre-allocated on purpose: marks appear 60 times a second while a car is
 * sliding, and creating a mesh per mark would hand the GC a few hundred
 * objects a second and the renderer a draw call each. One InstancedMesh with
 * a reused ring costs one draw call and allocates nothing after mount.
 *
 * The ring also bounds memory by construction -- the oldest mark is
 * overwritten rather than accumulated -- so a long race cannot slowly fill
 * the heap with tyre marks.
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { playerMutation } from '../player/config'

const MAX_MARKS = 240
/** Lie the mark just above the road, or z-fighting makes it strobe. Must be
 *  below the lane markings at 0.015 so tyre marks sit UNDER the paint. */
const Y = 0.008
/** Half the rear track, metres: where the rubber actually is. */
const TRACK_HALF = 0.82
/** Behind the car's centre, metres. */
const REAR_OFFSET = 1.3
const MARK_WIDTH = 0.24
/** Minimum travel before a new segment is laid, metres. */
const MIN_SEGMENT = 0.25

export interface SkidProps {
  /** Reads the car's world position each frame. */
  target: React.MutableRefObject<THREE.Vector3>
  /** Car heading in radians, for mark orientation. */
  heading: React.MutableRefObject<number>
}

export function Skid({ target, heading }: SkidProps) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const next = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const lastX = useRef(0)
  const lastZ = useRef(0)
  const hasLast = useRef(false)

  // Start every instance scaled to zero so nothing shows before the first
  // slide. An un-initialised InstancedMesh otherwise renders MAX_MARKS quads
  // stacked at the origin.
  const initialised = useRef(false)

  useFrame(() => {
    const m = mesh.current
    if (!m) return

    if (!initialised.current) {
      dummy.scale.set(0, 0, 0)
      dummy.updateMatrix()
      for (let i = 0; i < MAX_MARKS; i++) m.setMatrixAt(i, dummy.matrix)
      m.instanceMatrix.needsUpdate = true
      initialised.current = true
    }

    if (!playerMutation.sliding) {
      // Break the trail so the next slide starts a fresh mark instead of
      // drawing a long streak across wherever the car went in between.
      hasLast.current = false
      return
    }

    const px = target.current.x
    const pz = target.current.z
    if (!hasLast.current) {
      lastX.current = px
      lastZ.current = pz
      hasLast.current = true
      return
    }

    const dx = px - lastX.current
    const dz = pz - lastZ.current
    const travelled = Math.hypot(dx, dz)
    // Below this the car has barely moved and a mark would just stack on the
    // previous one, darkening a single spot instead of drawing a line.
    if (travelled < MIN_SEGMENT) return

    /* Each mark SPANS the distance covered since the last one, so the trail
     * is continuous at any speed.
     *
     * The first version dropped a fixed 0.7 m quad every 0.03 s. At 135 km/h
     * that is a mark every 1.1 m, so they never touched and the trail
     * rendered as a row of discrete black tiles rather than rubber. Sizing
     * the segment to the gap is what makes it a line. */
    const yaw = heading.current
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    const midX = (px + lastX.current) / 2
    const midZ = (pz + lastZ.current) / 2
    // Orient along the direction actually travelled, not where the car
    // points: in a slide those differ, and that difference is the whole
    // reason the marks are interesting.
    const travelAngle = Math.atan2(dx, dz)

    for (const side of [-1, 1]) {
      const ox = cos * (side * TRACK_HALF) - sin * -REAR_OFFSET
      const oz = -sin * (side * TRACK_HALF) - cos * -REAR_OFFSET
      dummy.position.set(midX + ox, Y, midZ + oz)
      dummy.rotation.set(-Math.PI / 2, 0, -travelAngle)
      // Slight overlap on length so consecutive segments butt together
      // rather than leaving hairline gaps as the car turns.
      // 1.6x so consecutive segments overlap rather than butt together.
      // At 1.15 the trail still read as dashes when the car was turning,
      // because a rotating segment leaves a wedge-shaped gap at the outside.
      dummy.scale.set(MARK_WIDTH, travelled * 1.6, 1)
      dummy.updateMatrix()
      m.setMatrixAt(next.current, dummy.matrix)
      next.current = (next.current + 1) % MAX_MARKS
    }
    m.instanceMatrix.needsUpdate = true

    lastX.current = px
    lastZ.current = pz
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_MARKS]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      {/* toneMapped={false}: ACES tone mapping was lifting near-black toward
          grey, which is why the marks read as pale planks rather than rubber.
          Multiply blending darkens the road instead of painting over it, so a
          mark looks burned into the surface. */}
      <meshBasicMaterial
        color="#14100e"
        transparent
        opacity={0.32}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.MultiplyBlending}
      />
    </instancedMesh>
  )
}
