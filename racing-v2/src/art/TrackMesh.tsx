/* The road surface, generated from the racing line.
 *
 * Original geometry by construction: the ribbon is extruded from the same
 * control points the AI drives, so there is no track mesh to import and the
 * road the player sees is provably the road the driver plans against. A track
 * authored separately from the line is how a game ends up with an AI that
 * corners into a wall.
 *
 * Colours come from the track's theme; hazards (gravel traps, puddles) are
 * generated from the same schema data that map-check validates, and the
 * start/finish gantry stands at line distance 0 on every circuit.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { usePlane } from '@react-three/cannon'
import type { RacingLine } from '../ai/racingLine'
import type { ThemeSpec, HazardSpec } from '../tracks/format'

/** Ribbon between `from(d)` and `to(d)` offsets; used for markings and for
 *  hazard patches. Positions are already world space. */
function ribbon(
  line: RacingLine,
  step: number,
  from: (p: { x: number; y: number; heading: number; half: number }) => [number, number],
  to: (p: { x: number; y: number; heading: number; half: number }) => [number, number],
  range?: [number, number],
): THREE.BufferGeometry {
  const samples = Math.max(8, Math.floor(line.length / step))
  const pos: number[] = []
  const idx: number[] = []
  const [d0, d1] = range ?? [0, line.length]
  const span = d1 - d0
  const n = Math.max(2, Math.floor(samples * (span / line.length)))
  for (let i = 0; i <= n; i++) {
    const d = (d0 + (i / n) * span) % line.length
    const p = line.at(d)
    const a = from(p)
    const b = to(p)
    pos.push(a[0], 0, a[1])
    pos.push(b[0], 0, b[1])
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function TrackMesh({
  line,
  step = 2,
  theme,
  hazards = [],
}: {
  line: RacingLine
  step?: number
  theme: ThemeSpec
  hazards?: HazardSpec[]
}) {
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

  /* Lane markings, built as their own thin ribbons rather than painted into
   * a texture. The project ships no textures, and generating them from the
   * same spline the road uses means they follow the circuit exactly instead
   * of sliding around at the corners the way projected UVs do.
   *
   * These are also the single biggest readability win on a grey road: without
   * edge lines the track and the verge read as one surface and there is no
   * sense of speed, because nothing passes the camera. */
  const markings = useMemo(() => {
    // Edge lines: continuous, set just inside the kerb.
    const edge = (side: 1 | -1) => {
      const pos: number[] = []
      const idx: number[] = []
      const W = 0.16
      const samples = Math.max(8, Math.floor(line.length / step))
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

  /* Hazards: gravel traps run from the road edge outward for 6 m beside the
   * declared section; puddles are dark patches ON the road. Both are visual
   * only in v1 -- the physics effect of a trap comes from surface.brake in
   * Vehicle.tsx. */
  const hazardGeometries = useMemo(() => {
    const out: { geometry: THREE.BufferGeometry; color: string; opacity: number; y: number }[] = []
    const nx = (p: { heading: number }) => -Math.sin(p.heading)
    const nz = (p: { heading: number }) => Math.cos(p.heading)
    for (const h of hazards) {
      const d0 = h.atFraction * line.length
      const d1 = Math.min(line.length, d0 + h.lengthFraction * line.length)
      if (h.kind === 'gravel-trap') {
        const sides = h.side === 'both' ? [1, -1] : [h.side === 'left' ? 1 : -1]
        for (const s of sides) {
          out.push({
            geometry: ribbon(
              line,
              step,
              (p) => [p.x + nx(p) * (p.half + 6) * s, p.y + nz(p) * (p.half + 6) * s],
              (p) => [p.x + nx(p) * (p.half + 0.1) * s, p.y + nz(p) * (p.half + 0.1) * s],
              [d0, d1],
            ),
            color: '#9a8a62',
            opacity: 1,
            y: 0.008,
          })
        }
      } else {
        // Puddle: a dark sheen across the middle of the road.
        out.push({
          geometry: ribbon(
            line,
            step,
            (p) => [p.x + nx(p) * p.half * 0.45, p.y + nz(p) * p.half * 0.45],
            (p) => [p.x - nx(p) * p.half * 0.45, p.y - nz(p) * p.half * 0.45],
            [d0, d1],
          ),
          color: '#20262e',
          opacity: 0.55,
          y: 0.01,
        })
      }
    }
    return out
  }, [hazards, line, step])

  /* Start/finish gantry, every track, at line distance 0.
   *
   * The posts stand 3 m clear of the road edge: at 1.2 m (the first attempt)
   * a car running wide visually clipped through the near post, which reads as
   * a glitch rather than a gantry. No collider either way -- the graze costs
   * nothing but the illusion must hold. */
  const gantry = useMemo(() => {
    const p = line.at(0)
    const nx = -Math.sin(p.heading)
    const nz = Math.cos(p.heading)
    const reach = p.half + 3.0
    return {
      postA: [p.x + nx * reach, 0, p.y + nz * reach] as [number, number, number],
      postB: [p.x - nx * reach, 0, p.y + nz * reach] as [number, number, number],
      beam: [p.x, 5.4, p.y] as [number, number, number],
      beamLength: reach * 2 + 1,
      yaw: Math.atan2(-nz, nx),
    }
  }, [line])

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color={theme.road} roughness={0.85} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>

      {/* Markings lifted 1.5 cm clear of the road. Any less and they z-fight
          and strobe as the camera moves, which is far worse than no line. */}
      <group position={[0, 0.015, 0]}>
        <mesh geometry={markings.left}>
          <meshBasicMaterial color={theme.roadEdge} toneMapped={false} />
        </mesh>
        <mesh geometry={markings.right}>
          <meshBasicMaterial color={theme.roadEdge} toneMapped={false} />
        </mesh>
        <mesh geometry={markings.centre}>
          <meshBasicMaterial color={theme.roadCentre} toneMapped={false} />
        </mesh>
      </group>

      {hazardGeometries.map((h, i) => (
        <mesh key={i} geometry={h.geometry} position={[0, h.y, 0]}>
          <meshStandardMaterial color={h.color} roughness={0.95} transparent={h.opacity < 1} opacity={h.opacity} />
        </mesh>
      ))}

      {/* Gantry: two posts and a beam. Thin geometry, no collision -- it
          stands outside the road reach so nothing drives into it. */}
      <group>
        {[gantry.postA, gantry.postB].map((pos, i) => (
          <mesh key={i} position={pos} castShadow>
            <boxGeometry args={[0.28, 5.4, 0.28]} />
            <meshStandardMaterial color="#3a3f47" roughness={0.6} metalness={0.4} />
          </mesh>
        ))}
        <mesh position={gantry.beam} rotation={[0, gantry.yaw, 0]} castShadow>
          <boxGeometry args={[gantry.beamLength, 0.7, 0.4]} />
          <meshStandardMaterial color={theme.roadEdge} roughness={0.5} />
        </mesh>
      </group>

      {/* Surrounding ground, so the world is not void where the road is not. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color={theme.ground} roughness={1} />
      </mesh>
    </group>
  )
}
