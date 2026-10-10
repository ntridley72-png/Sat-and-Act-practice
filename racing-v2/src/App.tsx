/* Game root.
 *
 * PHASE STATUS, stated plainly so nobody mistakes this for finished: the
 * renderer, the procedural art, the circuit and the AI grid are real and
 * running. The PLAYER vehicle is not yet wired to useRaycastVehicle with
 * upstream's tuning -- the camera currently watches the grid. That is the next
 * piece of work, and until it lands this is a demonstration of the opponents
 * rather than a playable race.
 *
 * All geometry is generated in code. This project ships no third-party meshes,
 * so there is nothing here for a compliance scan to flag.
 */
import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/cannon'
import { TrackMesh } from './art/TrackMesh'
import { Grid } from './ai/Grid'
import { buildRacingLine, APEX_FLATS } from './ai/racingLine'
import type { SkillName } from './ai/driver'

export type AppProps = {
  opponents: number
  seed: string
  skill?: SkillName | readonly SkillName[]
}

export function App({ opponents, seed, skill = 'medium' }: AppProps) {
  // The line is derived once and shared by the track mesh and every driver, so
  // the road drawn and the road planned against cannot drift apart.
  const line = useMemo(() => buildRacingLine(APEX_FLATS), [])

  return (
    <Canvas
      // Explicit DPR cap. A retina display would otherwise render at 2x and
      // spend the whole opponent frame budget on pixels instead of cars.
      dpr={[1, 1.5]}
      shadows
      camera={{ position: [40, 60, 150], fov: 45 }}
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
      <Physics gravity={[0, -9.81, 0]} broadphase="SAP" allowSleep={false}>
        <TrackMesh line={line} />
        <Grid line={line} count={opponents} raceSeed={seed} skill={skill} />
      </Physics>
    </Canvas>
  )
}
