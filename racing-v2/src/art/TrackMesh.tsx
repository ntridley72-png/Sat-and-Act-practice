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

  /* Lane markings, built as their own thin ribbons rather than painted into a
   * texture. The project ships no textures, and generating them from the same
   * spline the road uses means they follow the circuit exactly instead of
   * sliding around at the corners the way projected UVs do.
   *
   * These are also the single biggest readability win on a grey road: without
   * edge lines the track and the verge read as one surface and there is no
   * sense of speed, because nothing passes the camera. */
  const markings = useMemo(() => {
    const samples = Math.max(8, Math.floor(line.length / step))

    // Edge lines: continuous, set just inside the kerb.
    const edge = (side: 1 | -1) => {
      const pos: number[] = []
      const idx: number[] = []
      const W = 0.16
      for (let i = 0; i <= samples; i++) {
        const d = (i / samples) * line.length
        const p = line.at(d)
        const nx = -Math.sin(p.heading)
        const ny = Math.cos(p.heading)
        const off = side * (p.half - 0.45)
        pos.push(p.x + nx * (off - W), 0, p.y + ny * (off - W))
        pos.push(p.x + nx * (off + W), 0, p.y + ny * (off + W))
      }
      for (let i = 0; i < samples; i++) {
        const a = i * 2
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(idx)
      g.computeVertexNormals()
      return g
    }

    // Centre line: dashed, which is what actually conveys speed. A solid line
    // gives the eye nothing to measure motion against.
    const centre = () => {
      const pos: number[] = []
      const idx: number[] = []
      const DASH = 4
      const GAP = 6
      const W = 0.14
      for (let d = 0; d < line.length - DASH; d += DASH + GAP) {
        const base = pos.length / 3
        for (const t of [d, d + DASH]) {
          const p = line.at(t % line.length)
          const nx = -Math.sin(p.heading)
          const ny = Math.cos(p.heading)
          pos.push(p.x + nx * -W, 0, p.y + ny * -W)
          pos.push(p.x + nx * W, 0, p.y + ny * W)
        }
        idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(idx)
      g.computeVertexNormals()
      return g
    }

    return { left: edge(1), right: edge(-1), centre: centre() }
  }, [line, step])

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color="#3a3f47" roughness={0.85} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>

      {/* Markings lifted 1.5 cm clear of the road. Any less and they z-fight
          and strobe as the camera moves, which is far worse than no line. */}
      <group position={[0, 0.015, 0]}>
        <mesh geometry={markings.left}>
          <meshBasicMaterial color="#e8e6df" toneMapped={false} />
        </mesh>
        <mesh geometry={markings.right}>
          <meshBasicMaterial color="#e8e6df" toneMapped={false} />
        </mesh>
        <mesh geometry={markings.centre}>
          <meshBasicMaterial color="#d8d4c6" toneMapped={false} />
        </mesh>
      </group>
      {/* Surrounding ground, so the world is not void where the road is not. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color="#1d2a1f" roughness={1} />
      </mesh>
    </group>
  )
}
