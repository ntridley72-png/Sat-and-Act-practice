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
/** Lie the mark just above the road, or z-fighting makes it strobe. */
const Y = 0.012

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
  const lastDrop = useRef(0)

  // Start every instance scaled to zero so nothing shows before the first
  // slide. An un-initialised InstancedMesh otherwise renders MAX_MARKS quads
  // stacked at the origin.
  const initialised = useRef(false)

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return

    if (!initialised.current) {
      dummy.scale.set(0, 0, 0)
      dummy.updateMatrix()
      for (let i = 0; i < MAX_MARKS; i++) m.setMatrixAt(i, dummy.matrix)
      m.instanceMatrix.needsUpdate = true
      initialised.current = true
    }

    lastDrop.current += delta
    // Rate-limit: at 60fps an unthrottled drop burns the whole ring in four
    // seconds and the marks become a solid stripe.
    if (!playerMutation.sliding || lastDrop.current < 0.03) return
    lastDrop.current = 0

    dummy.position.copy(target.current)
    dummy.position.y = Y
    dummy.rotation.set(-Math.PI / 2, 0, heading.current)
    dummy.scale.set(1.5, 0.55, 1)
    dummy.updateMatrix()
    m.setMatrixAt(next.current, dummy.matrix)
    m.instanceMatrix.needsUpdate = true
    next.current = (next.current + 1) % MAX_MARKS
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_MARKS]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#0a0a0c" transparent opacity={0.4} depthWrite={false} />
    </instancedMesh>
  )
}
