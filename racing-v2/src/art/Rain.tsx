/* Rain: one line-segment cloud that falls, wraps, and follows the camera.
 *
 * A single geometry of ~1100 short vertical segments, translated downward
 * each frame and wrapped modulo its height, is enough to read as rain behind
 * a car at speed, and costs one draw call and no per-frame allocation.
 * Generated in code from a seeded stream like everything else.
 *
 * The cloud is recentred on the CAMERA each frame, not the circuit origin:
 * the tracks are a few hundred metres across and a static field would leave
 * the far end of a long circuit dry. Recentring XZ is O(1) and needs no
 * knowledge of where any car is.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import * as THREE from 'three'
import { createStream } from '../ai/random'

const FIELD = 240   // metres across, around the camera
const HEIGHT = 60   // metres of fall before wrapping
const DROPS = 1100

export function Rain({ seed = 'rain' }: { seed?: string }) {
  const ref = useRef<Group>(null)
  const geometry = useMemo(() => {
    const rng = createStream(`${seed}:rain`)
    const pos = new Float32Array(DROPS * 6)
    for (let i = 0; i < DROPS; i++) {
      const x = rng.float(-FIELD / 2, FIELD / 2)
      const z = rng.float(-FIELD / 2, FIELD / 2)
      const y = rng.float(0, HEIGHT)
      const len = rng.float(0.5, 1.3)
      pos[i * 6 + 0] = x
      pos[i * 6 + 1] = y
      pos[i * 6 + 2] = z
      pos[i * 6 + 3] = x + 0.09 // slight slant, so the fall has a direction
      pos[i * 6 + 4] = y - len
      pos[i * 6 + 5] = z
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [seed])

  const t = useRef(0)
  useFrame((state, delta) => {
    t.current += delta
    const g = ref.current
    if (!g) return
    g.position.set(state.camera.position.x, -((t.current * 24) % HEIGHT), state.camera.position.z)
  })

  return (
    <group ref={ref}>
      <lineSegments geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial color="#aab6cc" transparent opacity={0.42} toneMapped={false} />
      </lineSegments>
    </group>
  )
}
