/* Game root: scene, HUD and the race lifecycle.
 *
 * All geometry is generated in code. This project ships no third-party
 * meshes, textures or fonts; the only third-party assets are six CC0 audio
 * files, recorded in public/sounds/PROVENANCE.md and verified by hash in
 * tools/compliance-gate.mjs.
 *
 * THE TRACK IS DATA. Everything visual and physical here -- line, gates,
 * palette, scenery, off-road surface, speed cap, AI budget -- comes from the
 * selected TrackDefinition (src/tracks/catalog.ts). The App itself is
 * track-agnostic, which is what lets new circuits ship as data.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, sRGBEncoding } from 'three'
import { Physics } from '@react-three/cannon'
import { TrackMesh } from './art/TrackMesh'
import { Scenery } from './art/Scenery'
import { Sky } from './art/Sky'
import { Grid } from './ai/Grid'
import { Vehicle } from './player/Vehicle'
import { Hud } from './ui/Hud'
import { Intro, Finished, Help } from './ui/Screens'
import { buildTrackLine, trackById, trackGates, TRACKS, DEFAULT_TRACK_ID } from './tracks/catalog'
import { readSavedTrack, saveTrack } from './tracks/selection'
import { THEMES } from './tracks/format'
import type { WeatherId } from './tracks/format'
import { dimTheme, resolveWeather, WEATHER_GRIP } from './tracks/weather'
import { Rain } from './art/Rain'
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
  /** Track id requested by the host. Wins over the saved selection; an
   *  unknown id falls back to the default with no error. */
  track?: string
}

type Phase = 'intro' | 'racing' | 'finished'

/** Laps in a race. Short on purpose: this sits inside a study app, and a
 *  five-minute race is a five-minute detour from practice questions. */
const RACE_LAPS = 2

export function App({ opponents: initialOpponents, seed, skill = 'medium', paint: initialPaint, archetype: initialArchetype = 'sport', onQuit, assetBase, track: initialTrack }: AppProps) {
  /* Selection precedence: explicit host request > saved choice > default.
   * trackById validates: an id from localStorage or a host option is not
   * trusted, and anything unknown lands on a working circuit. */
  const [trackId, setTrackId] = useState<string>(() =>
    initialTrack ? trackById(initialTrack).id : (readSavedTrack() ?? DEFAULT_TRACK_ID),
  )
  const track = useMemo(() => trackById(trackId), [trackId])
  const line = useMemo(() => buildTrackLine(track), [track])
  const gates = useMemo(() => trackGates(track, line), [track, line])
  /* Weather is session state, not persisted: it resets to dry per session and
   * resolves against the track's supported set (dry is always supported, so
   * resolveWeather can only fall back to a legal value). */
  const [weather, setWeather] = useState<WeatherId>('dry')
  const activeWeather = resolveWeather(weather, track.weather)
  const grip = WEATHER_GRIP[activeWeather]
  const theme = dimTheme(THEMES[track.theme], activeWeather)

  const chooseTrack = useCallback((id: string) => {
    const valid = trackById(id).id
    setTrackId(valid)
    saveTrack(valid)
  }, [])

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
  const pole = useMemo(() => gridSlot(line, 0, track.grid), [line, track])

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
        {/* The world reads as a place, not a void, because sky, fog and
            ground are pulled from the track's theme. Fog is tuned to meet the
            sky colour so the two blend instead of banding. */}
        <color attach="background" args={[theme.background]} />
        <fog attach="fog" args={[theme.fog.color, theme.fog.near, theme.fog.far]} />
        <Sky top={theme.sky.top} horizon={theme.sky.horizon} bottom={theme.sky.bottom} />
        {/* Three-light rig rather than one lamp. A single directional light
            leaves one flank of every car in flat shadow and gives the
            bodywork no edge to catch, which is most of why the cars read as
            untextured blocks. Key defines form, fill lifts the shadow side
            enough to show the surface, and a low rim behind picks out the
            roofline and shoulder against the dark road. */}
        <hemisphereLight args={[theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity]} />
        <directionalLight
          position={[80, 120, 40]}
          color={theme.key.color}
          intensity={theme.key.intensity}
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
        <directionalLight position={[0, 25, -90]} intensity={theme.rim.intensity} color={theme.rim.color} />

        {/* stepSize must match FIXED_DT in Opponent.tsx: the driver and the
            solver have to advance together or a replay drifts. */}
        <Physics gravity={[0, -9.81, 0]} broadphase="SAP" allowSleep={false} stepSize={1 / 60}>
          <TrackMesh line={line} theme={theme} hazards={track.hazards} />
          <Scenery def={track} line={line} />
          {activeWeather === 'rain' && <Rain />}
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
            topSpeed={track.ai.topSpeed}
            grip={grip}
          />
          <Grid key={`grid-${runId}`} line={line} count={opponents} raceSeed={`${seed}:${runId}`} skill={skill} gates={gates} cornerBudget={track.ai.cornerBudget} grip={grip} />
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
          tracks={TRACKS}
          trackId={track.id}
          onTrackChange={chooseTrack}
          weatherOptions={track.weather}
          weather={activeWeather}
          onWeatherChange={setWeather}
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
