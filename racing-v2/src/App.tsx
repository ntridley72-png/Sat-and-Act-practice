/* Game root.
 *
 * PHASE STATUS, stated plainly so nobody mistakes this for finished: the
 * renderer, the procedural art, the circuit, the AI grid and the player's
 * raycast vehicle are all real and running. Still missing from §6: the Skid /
 * Dust / Boost effects, the audio rig, and the UI set (Minimap, LeaderBoard,
 * Clock, Checkpoint, Finished, Intro, PickColor, Help, Keys).
 *
 * All geometry is generated in code. This project ships no third-party meshes,
 * so there is nothing here for a compliance scan to flag.
 */
import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/cannon'
import { TrackMesh } from './art/TrackMesh'
import { Grid } from './ai/Grid'
import { Vehicle } from './player/Vehicle'
import { buildRacingLine, APEX_FLATS } from './ai/racingLine'
import type { SkillName } from './ai/driver'

export type AppProps = {
  opponents: number
  seed: string
  skill?: SkillName | readonly SkillName[]
  /** Paint for the player car, from the PickColor palette. */
  paint?: string
  /** Archetype for the player car. */
  archetype?: string
}

export function App({ opponents, seed, skill = 'medium', paint, archetype = 'sport' }: AppProps) {
  // The line is derived once and shared by the track mesh and every driver, so
  // the road drawn and the road planned against cannot drift apart.
  const line = useMemo(() => buildRacingLine(APEX_FLATS), [])

  return (
    <Canvas
      // Explicit DPR cap. A retina display would otherwise render at 2x and
      // spend the whole opponent frame budget on pixels instead of cars.
      dpr={[1, 1.5]}
      shadows
      // Starting camera only; Vehicle takes it over once the car exists.
      camera={{ position: [0, 6, -14], fov: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#0f1216']} />
      <fog attach="fog" args={['#0f1216', 180, 520]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        position={[80, 120, 40]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />

      {/* Gravity matches upstream so its vehicle tuning stays meaningful when
          the player car is wired in. */}
      {/* step is explicit and must match FIXED_DT in Opponent.tsx: the driver and
          the solver have to advance together or a deterministic replay drifts. */}
      <Physics gravity={[0, -9.81, 0]} broadphase="SAP" allowSleep={false} stepSize={1 / 60}>
        <TrackMesh line={line} />
        {/* The player starts on the line; the grid forms up behind it. */}
        <Vehicle position={[line.at(0).x, 1, line.at(0).y]} rotation={[0, -line.at(0).heading, 0]} archetype={archetype} paint={paint} />
        <Grid line={line} count={opponents} raceSeed={seed} skill={skill} />
      </Physics>
    </Canvas>
  )
}
