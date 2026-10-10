/* Dust kicked up under a sliding car.
 *
 * Same instanced, pre-allocated, ring-buffered approach as Skid, for the same
 * reasons. Particles have a lifetime and fade; a dead particle is simply
 * reused rather than removed, so the array never resizes.
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { playerMutation } from '../player/config'

const MAX = 70
const LIFE = 0.7
/* Dust was far too large and too opaque -- it rendered as grey beach balls
 * following the car. Real tyre smoke is a faint haze: small, short-lived and
 * barely there until there is a lot of it. */
const SIZE = 0.42

interface Particle {
  pos: THREE.Vector3
  vel: THREE.Vector3
  age: number
}

export interface DustProps {
  target: React.MutableRefObject<THREE.Vector3>
}

export function Dust({ target }: DustProps) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const next = useRef(0)
  const emit = useRef(0)
  const particles = useMemo<Particle[]>(
    () => Array.from({ length: MAX }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: LIFE })),
    [],
  )

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return
    const dt = Math.min(delta, 1 / 30)

    emit.current += dt
    if (playerMutation.sliding && emit.current > 0.04) {
      emit.current = 0
      const p = particles[next.current]
      next.current = (next.current + 1) % MAX
      p.pos.copy(target.current)
      p.pos.y = 0.15
      // Deterministic-ish spread is fine here: dust is cosmetic and is NOT
      // part of the seeded simulation, so Math.random is acceptable in this
      // one place. It must never leak into driver or physics code.
      p.vel.set((Math.random() - 0.5) * 1.4, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 1.4)
      p.age = 0
    }

    for (let i = 0; i < MAX; i++) {
      const p = particles[i]
      if (p.age >= LIFE) {
        dummy.scale.set(0, 0, 0)
      } else {
        p.age += dt
        p.pos.addScaledVector(p.vel, dt)
        p.vel.multiplyScalar(1 - 1.8 * dt)
        const t = p.age / LIFE
        dummy.position.copy(p.pos)
        dummy.scale.setScalar(SIZE * (0.3 + t * 1.1) * (1 - t))
      }
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 5]} />
      {/* Additive and very faint, so overlapping puffs build into haze rather
          than stacking into solid grey spheres. toneMapped={false} keeps it
          from being lifted by ACES into something far more visible than
          intended. */}
      <meshBasicMaterial
        color="#6d675c"
        transparent
        opacity={0.1}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  )
}
