/* The road surface, generated from the racing line.
 *
 * Original geometry by construction: the ribbon is extruded from the same
 * control points the AI drives, so there is no track mesh to import and the
 * road the player sees is provably the road the driver plans against. A track
 * authored separately from the line is how a game ends up with an AI that
 * corners into a wall.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { usePlane } from '@react-three/cannon'
import type { RacingLine } from '../ai/racingLine'

export function TrackMesh({ line, step = 2 }: { line: RacingLine; step?: number }) {
  const geometry = useMemo(() => {
    const samples = Math.max(8, Math.floor(line.length / step))
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    for (let i = 0; i <= samples; i++) {
      const d = (i / samples) * line.length
      const p = line.at(d)
      // Left/right edge from the line normal. The road's own half-width is
      // used, so the surface narrows exactly where the AI's offset clamp does.
      const nx = -Math.sin(p.heading)
      const ny = Math.cos(p.heading)
      positions.push(p.x + nx * p.half, 0, p.y + ny * p.half)
      positions.push(p.x - nx * p.half, 0, p.y - ny * p.half)
      const v = d / 12
      uvs.push(0, v, 1, v)
    }

    for (let i = 0; i < samples; i++) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [line, step])

  /* Physics is a single infinite plane, not the ribbon. Collision against a
   * ~600-vertex trimesh for thirteen cars would cost far more than it buys,
   * and the cars are kept on the road by the driver and by the player's own
   * steering, not by walls. Leaving the road is meant to be possible. */
  usePlane(() => ({ rotation: [-Math.PI / 2, 0, 0], position: [0, 0, 0], type: 'Static' }))

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color="#3a3f47" roughness={0.85} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* Surrounding ground, so the world is not void where the road is not. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color="#1d2a1f" roughness={1} />
      </mesh>
    </group>
  )
}
