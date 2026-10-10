/* Game root: scene, HUD and the race lifecycle.
 *
 * All geometry is generated in code. This project ships no third-party
 * meshes, textures or fonts; the only third-party assets are six CC0 audio
 * files, recorded in public/sounds/PROVENANCE.md and verified by hash in
 * tools/compliance-gate.mjs.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/cannon'
import { TrackMesh } from './art/TrackMesh'
import { Grid } from './ai/Grid'
import { Vehicle } from './player/Vehicle'
import { Hud } from './ui/Hud'
import { Intro, Finished, Help } from './ui/Screens'
import { buildRacingLine, APEX_FLATS } from './ai/racingLine'
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
}

type Phase = 'intro' | 'racing' | 'finished'

/** Laps in a race. Short on purpose: this sits inside a study app, and a
 *  five-minute race is a five-minute detour from practice questions. */
const RACE_LAPS = 2

export function App({ opponents: initialOpponents, seed, skill = 'medium', paint: initialPaint, archetype: initialArchetype = 'sport', onQuit }: AppProps) {
  const line = useMemo(() => buildRacingLine(APEX_FLATS), [])

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

  const startPoint = line.at(0)

  return (
    <div className="rv2-root">
      <Canvas
        // Explicit DPR cap. A retina display would otherwise render at 2x and
        // spend the opponent frame budget on pixels instead of cars.
        dpr={[1, 1.5]}
        shadows
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

        {/* stepSize must match FIXED_DT in Opponent.tsx: the driver and the
            solver have to advance together or a replay drifts. */}
        <Physics gravity={[0, -9.81, 0]} broadphase="SAP" allowSleep={false} stepSize={1 / 60}>
          <TrackMesh line={line} />
          <Vehicle
            key={`player-${runId}`}
            position={[startPoint.x, 1, startPoint.y]}
            rotation={[0, -startPoint.heading, 0]}
            archetype={archetype}
            paint={paint}
            onLap={onLap}
            line={line}
          />
          <Grid key={`grid-${runId}`} line={line} count={opponents} raceSeed={`${seed}:${runId}`} skill={skill} />
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
