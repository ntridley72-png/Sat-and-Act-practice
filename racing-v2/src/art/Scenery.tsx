/* Scenery: the track's generated props and landmarks, as instanced meshes.
 *
 * Every prop is a primitive (cylinder, cone, box, icosahedron) generated from
 * the placements in src/tracks/scatter.ts, which is pure and deterministic --
 * the same code tools/map-check.mjs runs to prove no prop sits on the road.
 * No meshes, textures or fonts are shipped; the compliance gate stays green
 * by construction.
 *
 * INSTANCING, because scenery is otherwise the cheapest way to lose the
 * frame: one draw call per prop type regardless of count. Distant props are
 * not culled individually -- the fog eats them first.
 */
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { RacingLine } from '../ai/racingLine'
import type { TrackDefinition } from '../tracks/format'
import { scatterTrack, type LandmarkPlacement, type PropPlacement } from '../tracks/scatter'

interface InstanceProps {
  items: PropPlacement[]
  /** Extra height applied to every placement (part offsets for compositions). */
  yBase?: number
  /** Pitch tilt, radians (solar panels). */
  tilt?: number
  /** Optional per-instance palette; picked by placement.variant. */
  colors?: readonly string[]
  castShadow?: boolean
  children: ReactNode
}

function Instances({ items, yBase = 0, tilt = 0, colors, castShadow, children }: InstanceProps) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const palette = useMemo(
    () => (colors ? colors.map((c) => new THREE.Color(c)) : null),
    [colors],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    const v = new THREE.Vector3()
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      e.set(tilt, it.rot, 0)
      q.setFromEuler(e)
      s.setScalar(it.scale)
      v.set(it.x, it.y + yBase, it.z)
      m.compose(v, q, s)
      mesh.setMatrixAt(i, m)
      if (palette) mesh.setColorAt(i, palette[Math.min(palette.length - 1, Math.floor(it.variant * palette.length))])
    }
    mesh.instanceMatrix.needsUpdate = true
    if (palette && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items, yBase, tilt, palette])

  if (!items.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={castShadow} receiveShadow={castShadow}>
      {children}
    </instancedMesh>
  )
}

/* ---- kinds --------------------------------------------------------------- */

function Pines({ items }: { items: PropPlacement[] }) {
  return (
    <>
      <Instances items={items} yBase={1.3} castShadow>
        <cylinderGeometry args={[0.26, 0.36, 2.6, 6]} />
        <meshStandardMaterial color="#5b4632" roughness={0.9} />
      </Instances>
      <Instances items={items} yBase={4.6} castShadow>
        <coneGeometry args={[2.0, 5.4, 7]} />
        <meshStandardMaterial color="#2f5d3a" roughness={0.85} />
      </Instances>
    </>
  )
}

function Redwoods({ items }: { items: PropPlacement[] }) {
  return (
    <>
      <Instances items={items} yBase={6.2} castShadow>
        <cylinderGeometry args={[0.8, 1.25, 12.5, 7]} />
        <meshStandardMaterial color="#6b4a35" roughness={0.95} />
      </Instances>
      <Instances items={items} yBase={13.5} castShadow>
        <coneGeometry args={[3.8, 13.5, 8]} />
        <meshStandardMaterial color="#24442c" roughness={0.9} />
      </Instances>
    </>
  )
}

const CONTAINER_COLORS = ['#b8402e', '#2e6fae', '#3f8f4f', '#c98a2c', '#7a4a9e', '#279a8a', '#b7652a', '#8c8f96']

function Containers({ items }: { items: PropPlacement[] }) {
  const stacked = useMemo(
    () => items.filter((_, i) => i % 3 === 0).map((p) => ({ ...p, y: p.y + 2.6, rot: p.rot + 0.05 })),
    [items],
  )
  return (
    <>
      <Instances items={items} yBase={1.3} colors={CONTAINER_COLORS} castShadow>
        <boxGeometry args={[6.1, 2.6, 2.5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.75} metalness={0.25} />
      </Instances>
      <Instances items={stacked} yBase={0} colors={CONTAINER_COLORS} castShadow>
        <boxGeometry args={[6.1, 2.6, 2.5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.75} metalness={0.25} />
      </Instances>
    </>
  )
}

function Clouds({ items }: { items: PropPlacement[] }) {
  return (
    <Instances items={items}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#dfe6ff" emissive="#8f9fe8" emissiveIntensity={0.28} roughness={1} />
    </Instances>
  )
}

function Rocks({ items, tint = '#6e6a63' }: { items: PropPlacement[]; tint?: string }) {
  const seated = useMemo(() => items.map((p) => ({ ...p, y: p.y + p.scale * 0.7 })), [items])
  return (
    <Instances items={seated} castShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={tint} roughness={0.95} />
    </Instances>
  )
}

function Solar({ items }: { items: PropPlacement[] }) {
  return (
    <Instances items={items} yBase={1.4} tilt={-0.38}>
      <boxGeometry args={[6.6, 0.2, 4.4]} />
      <meshStandardMaterial color="#1d3a5f" roughness={0.35} metalness={0.55} />
    </Instances>
  )
}

function SeaProps({ items }: { items: PropPlacement[] }) {
  return (
    <Instances items={items} yBase={0.9} colors={['#c33a2e', '#e8e4d8', '#2e8f6a']}>
      <cylinderGeometry args={[0.45, 0.65, 1.8, 8]} />
      <meshStandardMaterial color="#ffffff" roughness={0.6} />
    </Instances>
  )
}

/* ---- landmarks ----------------------------------------------------------- */

function Landmark({ lm }: { lm: LandmarkPlacement }) {
  const s = lm.scale
  switch (lm.kind) {
    case 'spire':
      return (
        <group position={[lm.x, 0, lm.z]} rotation={[0, lm.rot, 0]} scale={s}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <cylinderGeometry args={[3.4, 4.6, 2.4, 8]} />
            <meshStandardMaterial color="#4a4470" roughness={0.7} />
          </mesh>
          <mesh position={[0, 15, 0]} castShadow>
            <coneGeometry args={[2.2, 25, 6]} />
            <meshStandardMaterial color="#b9a9ff" emissive="#6a5acd" emissiveIntensity={0.6} roughness={0.3} />
          </mesh>
        </group>
      )
    case 'lighthouse':
      return (
        <group position={[lm.x, 0, lm.z]} rotation={[0, lm.rot, 0]} scale={s}>
          <mesh position={[0, 7, 0]} castShadow>
            <cylinderGeometry args={[1.5, 2.4, 14, 10]} />
            <meshStandardMaterial color="#e8e4d8" roughness={0.8} />
          </mesh>
          <mesh position={[0, 4.5, 0]}>
            <cylinderGeometry args={[1.62, 1.72, 2.2, 10]} />
            <meshStandardMaterial color="#c33a2e" roughness={0.8} />
          </mesh>
          <mesh position={[0, 9.5, 0]}>
            <cylinderGeometry args={[1.42, 1.55, 2.0, 10]} />
            <meshStandardMaterial color="#c33a2e" roughness={0.8} />
          </mesh>
          <mesh position={[0, 14.6, 0]}>
            <boxGeometry args={[2.4, 1.6, 2.4]} />
            <meshStandardMaterial color="#ffd166" emissive="#ffb703" emissiveIntensity={1.1} />
          </mesh>
        </group>
      )
    case 'arch':
      return (
        <group position={[lm.x, 0, lm.z]} rotation={[0, lm.rot, 0]} scale={s}>
          <mesh position={[-5.4, 4.6, 0]} castShadow>
            <boxGeometry args={[2.2, 9.2, 2.2]} />
            <meshStandardMaterial color="#8c8375" roughness={0.9} />
          </mesh>
          <mesh position={[5.4, 4.6, 0]} castShadow>
            <boxGeometry args={[2.2, 9.2, 2.2]} />
            <meshStandardMaterial color="#8c8375" roughness={0.9} />
          </mesh>
          <mesh position={[0, 9.2, 0]} rotation={[0, 0, Math.PI]} scale={[1, 1, 0.5]}>
            <torusGeometry args={[5.4, 1.1, 8, 20, Math.PI]} />
            <meshStandardMaterial color="#8c8375" roughness={0.9} />
          </mesh>
        </group>
      )
    case 'mesa':
      return (
        <group position={[lm.x, 0, lm.z]} rotation={[0, lm.rot, 0]} scale={s}>
          <mesh position={[0, 5, 0]} castShadow>
            <cylinderGeometry args={[7.4, 10.5, 10, 8]} />
            <meshStandardMaterial color="#b98a5a" roughness={1} />
          </mesh>
          <mesh position={[0, 10.3, 0]}>
            <cylinderGeometry args={[7.6, 7.6, 0.8, 8]} />
            <meshStandardMaterial color="#c79a68" roughness={1} />
          </mesh>
        </group>
      )
    case 'crane':
      return (
        <group position={[lm.x, 0, lm.z]} rotation={[0, lm.rot, 0]} scale={s}>
          <mesh position={[0, 9, 0]} castShadow>
            <boxGeometry args={[1.3, 18, 1.3]} />
            <meshStandardMaterial color="#c8502e" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[-5, 17.5, 0]} castShadow>
            <boxGeometry args={[12.5, 0.9, 0.9]} />
            <meshStandardMaterial color="#c8502e" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[3.4, 15.9, 0]}>
            <boxGeometry args={[1.6, 2.4, 1.6]} />
            <meshStandardMaterial color="#3a3f47" roughness={0.7} />
          </mesh>
        </group>
      )
    case 'grandstand':
      return (
        <group position={[lm.x, 0, lm.z]} rotation={[0, lm.rot, 0]} scale={s}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[16, 2.4, 5]} />
            <meshStandardMaterial color="#b4bcc6" roughness={0.8} />
          </mesh>
          <mesh position={[0, 3.4, 1.2]} castShadow>
            <boxGeometry args={[16, 2.0, 3.4]} />
            <meshStandardMaterial color="#9aa4b0" roughness={0.8} />
          </mesh>
          <mesh position={[0, 5.2, 2.1]} castShadow>
            <boxGeometry args={[16, 1.8, 2.2]} />
            <meshStandardMaterial color="#84909e" roughness={0.8} />
          </mesh>
        </group>
      )
    case 'radiotower':
      return (
        <group position={[lm.x, 0, lm.z]} rotation={[0, lm.rot, 0]} scale={s}>
          <mesh position={[0, 11, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.9, 22, 6]} />
            <meshStandardMaterial color="#4a4e52" roughness={0.6} metalness={0.4} />
          </mesh>
          {[6, 12, 17].map((h) => (
            <mesh key={h} position={[0, h, 0]}>
              <boxGeometry args={[3.4, 0.35, 0.35]} />
              <meshStandardMaterial color="#4a4e52" roughness={0.6} metalness={0.4} />
            </mesh>
          ))}
        </group>
      )
    default:
      return null
  }
}

/* ---- entry --------------------------------------------------------------- */

export function Scenery({ def, line }: { def: TrackDefinition; line: RacingLine }) {
  const { props, landmarks } = useMemo(() => scatterTrack(def, line), [def, line])
  const kind = def.scenery.kind

  return (
    <group>
      {kind === 'pines' && <Pines items={props} />}
      {kind === 'redwoods' && <Redwoods items={props} />}
      {kind === 'containers' && <Containers items={props} />}
      {kind === 'clouds' && <Clouds items={props} />}
      {kind === 'rocks' && <Rocks items={props} />}
      {kind === 'solar' && <Solar items={props} />}
      {kind === 'sea' && <SeaProps items={props} />}
      {kind === 'dunes' && <Rocks items={props} tint="#b9a06a" />}
      {landmarks.map((lm) => (
        <Landmark key={lm.name} lm={lm} />
      ))}
    </group>
  )
}
