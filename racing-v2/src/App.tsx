/* Game root: scene, HUD and the race lifecycle.
 *
 * All geometry is generated in code. This project ships no third-party
 * meshes, textures or fonts; the only third-party assets are six CC0 audio
 * files, recorded in public/sounds/PROVENANCE.md and verified by hash in
 * tools/compliance-gate.mjs.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, sRGBEncoding } from 'three'
import { Physics } from '@react-three/cannon'
import { TrackMesh } from './art/TrackMesh'
import { Sky } from './art/Sky'
import { Grid } from './ai/Grid'
import { Vehicle } from './player/Vehicle'
import { Hud } from './ui/Hud'
import { Intro, Finished, Help } from './ui/Screens'
import { buildTrackLine, trackById, trackGates, DEFAULT_TRACK_ID } from './tracks/catalog'
import { gridSlot, yawForZForward } from './ai/gridSlots'
import { mutation, resetOpponents } from './ai/mutation'
import { playerMutation } from './player/config'
import type { SkillName } from './ai/driver'

export type AppProps = {
  opponents: number
  seed: string
  skill?: SkillName | readonly SkillName[]
  paint?: string
  archetype?: string
  /** Host callback for "back to the arcade". */
  onQuit?: () => void
  /** Base URL the game's assets are served from. */
  assetBase?: string
}

type Phase = 'intro' | 'racing' | 'finished'

/** Laps in a race. Short on purpose: this sits inside a study app, and a
 *  five-minute race is a five-minute detour from practice questions. */
const RACE_LAPS = 2

export function App({ opponents: initialOpponents, seed, skill = 'medium', paint: initialPaint, archetype: initialArchetype = 'sport', onQuit, assetBase }: AppProps) {
  const track = useMemo(() => trackById(DEFAULT_TRACK_ID), [])
  const line = useMemo(() => buildTrackLine(track), [track])
  const gates = useMemo(() => trackGates(track, line), [track, line])

  const [phase, setPhase] = useState<Phase>('intro')
  const [opponents, setOpponents] = useState(initialOpponents)
  const [paint, setPaint] = useState(initialPaint ?? '#c8102e')
  const [archetype, setArchetype] = useState(initialArchetype)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [result, setResult] = useState({ time: '0:00.00', position: 1, total: 1 })
  /* Bumped on every restart so React remounts the whole scene. Resetting a
     live physics world in place is far more error-prone than rebuilding it,
     and a race start is not a moment where frame cost matters. */
  const [runId, setRunId] = useState(0)
  const finishedRef = useRef(false)

  const start = useCallback(({ paint: p, archetype: a, opponents: n }: { paint: string; archetype: string; opponents: number }) => {
    resetOpponents()
    playerMutation.boost = 100
    playerMutation.speed = 0
    mutation.player.lap = 0
    mutation.player.progress = 0
    finishedRef.current = false
    setPaint(p)
    setArchetype(a)
    setOpponents(n)
    setRunId((r) => r + 1)
    setStartedAt(performance.now())
    setPhase('racing')
  }, [])

  /* Called by the player car each lap. Kept here rather than in Vehicle so
     the lifecycle lives in one place. */
  const onLap = useCallback((lap: number) => {
    if (finishedRef.current || lap < RACE_LAPS) return
    finishedRef.current = true

    const elapsed = startedAt === null ? 0 : (performance.now() - startedAt) / 1000
    const m = Math.floor(elapsed / 60)
    const s = Math.floor(elapsed % 60)
    const cs = Math.floor((elapsed * 100) % 100)

    // Position = how many cars have covered more ground than the player.
    const playerDist = mutation.player.lap * line.length + mutation.player.progress
    let ahead = 0
    for (let i = 0; i < mutation.count; i++) {
      const o = mutation.opponents[i]
      if (o.active && o.lap * line.length + o.progress > playerDist) ahead++
    }
    setResult({
      time: `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`,
      position: ahead + 1,
      total: opponents + 1,
    })
    setPhase('finished')
  }, [startedAt, line, opponents])

  /* The player is grid slot 0 -- pole. Same function the field uses, so the
     formation actually agrees. yawForZForward because the raycast vehicle's
     forward is +Z, not the +X the opponents use. */
  const pole = useMemo(() => gridSlot(line, 0), [line])

  return (
    <div className="rv2-root">
      <Canvas
        // Explicit DPR cap. A retina display would otherwise render at 2x and
        // spend the opponent frame budget on pixels instead of cars.
        dpr={[1, 1.5]}
        shadows
        camera={{ position: [0, 6, -14], fov: 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          /* PBR needs both of these or it looks wrong in opposite directions.
           * Without sRGB output the whole scene renders washed out and
           * desaturated; without tone mapping the clearcoat highlights and
           * the reflections clip to flat white instead of rolling off. The
           * paint materials are physical materials with a clearcoat layer, so
           * this is the difference between car paint and coloured plastic. */
          gl.outputEncoding = sRGBEncoding
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.15
        }}
      >
        {/* A graded sky, not a black void. The horizon was previously the
            same near-black as the fog, so the world simply stopped at the
            edge of the grass and the scene read as unfinished. Fog is tuned
            to meet the sky colour so the two blend instead of banding. */}
        <color attach="background" args={['#1b2434']} />
        <fog attach="fog" args={['#1b2434', 140, 460]} />
        <Sky />
        {/* Three-light rig rather than one lamp. A single directional light
            leaves one flank of every car in flat shadow and gives the
            bodywork no edge to catch, which is most of why the cars read as
            untextured blocks. Key defines form, fill lifts the shadow side
            enough to show the surface, and a low rim behind picks out the
            roofline and shoulder against the dark road. */}
        <hemisphereLight args={['#9fb3d4', '#2a2e26', 0.45]} />
        <directionalLight
          position={[80, 120, 40]}
          intensity={1.45}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          // Softer PCF edge. A hard-edged shadow under a car reads as a
          // sticker; a little penumbra is what makes it sit on the road.
          shadow-radius={2.5}
          shadow-camera-left={-120}
          shadow-camera-right={120}
          shadow-camera-top={120}
          shadow-camera-bottom={-120}
        />
        <directionalLight position={[-60, 40, -30]} intensity={0.35} color="#9db6e0" />
        <directionalLight position={[0, 25, -90]} intensity={0.5} color="#ffd9a8" />

        {/* stepSize must match FIXED_DT in Opponent.tsx: the driver and the
            solver have to advance together or a replay drifts. */}
        <Physics gravity={[0, -9.81, 0]} broadphase="SAP" allowSleep={false} stepSize={1 / 60}>
          <TrackMesh line={line} />
          <Vehicle
            key={`player-${runId}`}
            position={[pole.x, 1, pole.z]}
            rotation={[0, yawForZForward(pole.heading), 0]}
            archetype={archetype}
            paint={paint}
            assetBase={assetBase}
            startDistance={pole.distance}
            onLap={onLap}
            line={line}
            gates={gates}
          />
          <Grid key={`grid-${runId}`} line={line} count={opponents} raceSeed={`${seed}:${runId}`} skill={skill} gates={gates} />
        </Physics>
      </Canvas>

      {phase === 'racing' && (
        <>
          <Hud line={line} opponents={opponents} startedAt={startedAt} />
          <Help />
        </>
      )}
      {phase === 'intro' && (
        <Intro
          onStart={start}
          initialPaint={initialPaint}
          initialArchetype={initialArchetype}
          initialOpponents={initialOpponents}
        />
      )}
      {phase === 'finished' && (
        <Finished
          time={result.time}
          position={result.position}
          total={result.total}
          onRestart={() => start({ paint, archetype, opponents })}
          onQuit={() => onQuit?.()}
        />
      )}
    </div>
  )
}
