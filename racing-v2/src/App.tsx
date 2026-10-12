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
 *
 * THE ECONOMY IS THE HOST'S. v2 is the game now, so the v1 session rules
 * carry over: Open Practice is free and never recorded; a Scored run costs
 * one token, gets five minutes of ACTIVE driving, and banks a record. The
 * rules live behind an EconomyBridge provided by racing/index.js (where the
 * student profile lives); this file only drives what the student sees.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  SCORED_ACTIVE_SECONDS,
  SCORED_IDLE_END_SECONDS,
  formatRunTime,
} from './economy'
import type { EconomyBridge, RecordEntry, RunMode } from './economy'
import { carPhysics, resolvePaint, racePayout, DEFAULT_TUNE } from './garage'
import type { CarSpec, GarageBridge, TuneSpec } from './garage'

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
  /** The host's session economy. Absent (e.g. in isolation) means practice
   *  only: nothing spends and nothing is recorded. */
  economy?: EconomyBridge
  /** The host's garage: cash, the car roster, purchases, tune, cosmetics.
   *  Absent (bench pages) means free play with the raw archetypes. */
  garage?: GarageBridge
}

type Phase = 'intro' | 'racing' | 'finished'

/** Laps in a race. Short on purpose: this sits inside a study app, and a
 *  five-minute race is a five-minute detour from practice questions. */
const RACE_LAPS = 2

export interface RunOutcome {
  time: string
  position: number
  total: number
  mode: RunMode
  /** The run hit the time cap or ended while idle: not recorded. */
  timeUp: boolean
  endReason: 'clock' | 'idle' | null
  /** A scored run that counted in the economy (whether or not it beat a best). */
  recorded: boolean
  improvedRace: boolean
  improvedLap: boolean
  best: RecordEntry | null
  lap: string | null
  /** Cash banked by this run's finish (0 unless a scored race finished). */
  payout: number
}

const FALLBACK_WINGS: Record<string, { name: string; price: number }> = {
  none: { name: 'No wing', price: 0 },
  lip: { name: 'Lip', price: 150 },
  duck: { name: 'Ducktail', price: 300 },
  gt: { name: 'GT wing', price: 600 },
}
const FALLBACK_FINISHES: Record<string, string> = {
  gloss: 'Gloss', metallic: 'Metallic', matte: 'Matte', pearl: 'Pearl', chrome: 'Chrome',
}

const EMPTY_OUTCOME: RunOutcome = {
  time: '0:00.00', position: 1, total: 1, mode: 'practice',
  timeUp: false, endReason: null, recorded: false,
  improvedRace: false, improvedLap: false, best: null, lap: null, payout: 0,
}

export function App({ opponents: initialOpponents, seed, skill = 'medium', paint: initialPaint, archetype: initialArchetype = 'sport', onQuit, assetBase, track: initialTrack, economy, garage }: AppProps) {
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

  /* ---- economy state ------------------------------------------------------ */
  const tokenCost = economy?.tokenCost ?? 1
  const [tokens, setTokens] = useState(() => economy?.tokens() ?? 0)
  const [runMode, setRunMode] = useState<RunMode>(() =>
    economy?.initialMode === 'scored' && economy.tokens() >= (economy.tokenCost || 1) ? 'scored' : 'practice',
  )
  const affordable = !economy || tokens >= tokenCost

  /* ---- garage state ------------------------------------------------------- */
  /* null = the roster is still loading; [] = no host garage (bench pages),
     in which case the raw archetype chips keep working as before. */
  const [roster, setRoster] = useState<CarSpec[] | null>(null)
  const [selected, setSelected] = useState<string>(() => (garage ? garage.car() : (initialArchetype ?? 'sport')))
  const [cash, setCash] = useState(() => garage?.cash() ?? 0)
  const [unlocked, setUnlocked] = useState<string[]>(() => (garage ? garage.unlocked() : []))
  const [tune, setTune] = useState<TuneSpec>(() => garage?.tune() ?? DEFAULT_TUNE)
  const [styleState, setStyleState] = useState(() => garage?.style() ?? { paint: '#c8102e', finish: 'metallic', spoiler: 'lip', neon: 'none' })
  const [paintPalette] = useState<Record<string, string> | null>(() => garage?.paintPalette() ?? null)
  const [ownedWings, setOwnedWings] = useState<string[]>(() => garage?.ownedWings() ?? ['none', 'lip'])
  const [camMode, setCamMode] = useState<'chase' | 'far' | 'hood'>(() => garage?.cam() ?? 'chase')
  const [volume, setVolumeState] = useState(() => garage?.volume() ?? 0.7)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!garage) { setRoster([]); return }
    let live = true
    garage.roster().then((list) => {
      if (!live) return
      setRoster(list.length ? list : [])
      /* A selection saved by an older version may carry a legacy id; the
         launch records' migrateSelection maps it forward. */
      if (list.length && !list.some((c) => c.id === selected)) {
        const fixed = garage.migrate ? garage.migrate(selected) : 'sport'
        setSelected(fixed)
        garage.select(fixed)
      }
    }).catch(() => { if (live) setRoster([]) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garage])

  const refreshGarage = useCallback(() => {
    if (!garage) return
    setCash(garage.cash())
    setTokens(garage.tokens())
    setUnlocked(garage.unlocked())
    setTune(garage.tune())
    setStyleState(garage.style())
    setOwnedWings(garage.ownedWings())
  }, [garage])

  const carSpec = useMemo(() => (roster ? roster.find((c) => c.id === selected) ?? null : null), [roster, selected])
  const carConfig = useMemo(() => (carSpec ? carPhysics(carSpec, tune) : null), [carSpec, tune])
  const paintHex = useMemo(() => resolvePaint(styleState.paint, paintPalette), [styleState.paint, paintPalette])

  const chooseCar = useCallback((id: string) => {
    if (!garage) { setSelected(id); return } // bench: id is a raw archetype
    const spec = roster?.find((c) => c.id === id)
    if (!unlocked.includes(id)) {
      if (!spec) return
      if (cash < spec.price) {
        setNotice(`Need $${spec.price.toLocaleString()} — earn cash by racing.`)
        return
      }
      if (!garage.buy(id)) {
        setNotice('That purchase did not complete.')
        return
      }
    }
    garage.select(id)
    setSelected(id)
    setNotice(null)
    refreshGarage()
  }, [garage, roster, unlocked, cash, refreshGarage])

  const changeTune = useCallback((key: keyof TuneSpec, value: number) => {
    setTune((t) => ({ ...t, [key]: value }))
    garage?.setTune({ [key]: value })
  }, [garage])

  const resetTune = useCallback(() => {
    setTune(DEFAULT_TUNE)
    garage?.setTune(DEFAULT_TUNE)
  }, [garage])

  const changeStyle = useCallback((patch: { paint?: string; finish?: string; spoiler?: string; neon?: string }) => {
    if (!garage) {
      setStyleState((v) => ({ ...v, ...patch }))
      return
    }
    garage.setStyle(patch)
    const after = garage.style()
    if (patch.spoiler && after.spoiler !== patch.spoiler) setNotice('Need cash for that wing — earn cash by racing.')
    else setNotice(null)
    setStyleState(after)
    setCash(garage.cash())
    setOwnedWings(garage.ownedWings())
  }, [garage])

  const convertTokens = useCallback((all: boolean) => {
    if (!garage) return
    const amount = all ? garage.tokens() : Math.min(1, garage.tokens())
    const gained = garage.convertTokens(amount)
    if (gained) economy?.toast(`+$${gained} garage cash`)
    refreshGarage()
  }, [garage, economy, refreshGarage])

  const changeCam = useCallback((mode: 'chase' | 'far' | 'hood') => {
    setCamMode(mode)
    garage?.setCam(mode)
  }, [garage])

  const changeVolume = useCallback((v: number) => {
    setVolumeState(v)
    garage?.setVolume(v)
  }, [garage])

  const [phase, setPhaseRaw] = useState<Phase>('intro')
  /* Mirrors of phase/result for the test probe. Reading state values from the
     probe's closure made the probe racy (a read between a finish and React's
     effect re-run returned pre-finish values); refs are always live. */
  const phaseRef = useRef<Phase>('intro')
  const resultRef = useRef<RunOutcome>(EMPTY_OUTCOME)
  const setPhase = useCallback((p: Phase) => { phaseRef.current = p; setPhaseRaw(p) }, [])
  const [opponents, setOpponents] = useState(initialOpponents)
  const [paint, setPaint] = useState(initialPaint ?? '#c8102e')
  const [archetype, setArchetype] = useState(initialArchetype)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [result, setResult] = useState<RunOutcome>(EMPTY_OUTCOME)
  /* Bumped on every restart so React remounts the whole scene. Resetting a
     live physics world in place is far more error-prone than rebuilding it,
     and a race start is not a moment where frame cost matters. */
  const [runId, setRunId] = useState(0)
  const finishedRef = useRef(false)

  /* Everything the finish path needs about the CURRENT run, in a ref: the
     finish can arrive from a lap callback, the scored clock, or the test
     seam, and none of them may read stale React state. */
  const run = useRef({
    mode: 'practice' as RunMode,
    startedAt: 0,
    trackId: track.id,
    weather: 'dry' as WeatherId,
    opponents: 0,
    bestLap: null as number | null,
    lastLapAt: 0,
  })
  /** The scored-run clock: remaining seconds, idle time, and recent input. */
  const clock = useRef({ mode: 'practice' as RunMode, active: false, remaining: SCORED_ACTIVE_SECONDS, idle: 0, lastInput: 0 })

  const finishRun = useCallback((timeUp: boolean, endReason: 'clock' | 'idle' | null = null, secondsOverride?: number, lapOverride?: number | null, pay = true) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const r = run.current
    const elapsed = secondsOverride ?? (performance.now() - r.startedAt) / 1000
    const lapBest = lapOverride === undefined ? r.bestLap : lapOverride

    // Position = how many cars have covered more ground than the player.
    const playerDist = mutation.player.lap * line.length + mutation.player.progress
    let ahead = 0
    for (let i = 0; i < mutation.count; i++) {
      const o = mutation.opponents[i]
      if (o.active && o.lap * line.length + o.progress > playerDist) ahead++
    }

    const outcome: RunOutcome = {
      ...EMPTY_OUTCOME,
      time: formatRunTime(elapsed),
      position: ahead + 1,
      total: r.opponents + 1,
      mode: r.mode,
      timeUp,
      endReason,
      lap: lapBest == null ? null : formatRunTime(lapBest),
    }

    if (r.mode === 'scored' && !timeUp && economy) {
      const res = economy.record(r.trackId, r.weather, {
        race: Math.round(elapsed * 1000) / 1000,
        lap: lapBest == null ? null : Math.round(lapBest * 1000) / 1000,
        position: outcome.position,
      })
      outcome.recorded = res.entry != null
      outcome.improvedRace = res.improvedRace
      outcome.improvedLap = res.improvedLap
      outcome.best = res.entry
      setTokens(economy.tokens())
    }

    /* SCORED RACES PAY. Practice and unrecorded (time-up/idle) runs pay
       nothing, matching v1 where only scored runs banked cash. The table
       lives in one place (garage.ts) and is unit-tested. `pay === false` is
       reserved for the test seam below: it must never mint cash. */
    if (r.mode === 'scored' && !timeUp && garage && pay) {
      outcome.payout = racePayout({
        seconds: elapsed,
        position: outcome.position,
        finished: true,
        weather: r.weather,
      })
      garage.addCash(outcome.payout)
      setCash(garage.cash())
    }

    resultRef.current = outcome
    setResult(outcome)
    setPhase('finished')
  }, [economy, garage, line, setPhase])

  /* Called by the player car each lap. Kept here rather than in Vehicle so
     the lifecycle lives in one place. */
  const onLap = useCallback((lap: number) => {
    if (finishedRef.current) return
    const r = run.current
    const elapsed = (performance.now() - r.startedAt) / 1000
    const split = elapsed - r.lastLapAt
    r.lastLapAt = elapsed
    r.bestLap = r.bestLap == null ? split : Math.min(r.bestLap, split)
    if (lap >= RACE_LAPS) finishRun(false)
  }, [finishRun])

  const start = useCallback(({ paint: p, archetype: a, opponents: n }: { paint: string; archetype: string; opponents: number }, modeOverride?: RunMode) => {
    let mode: RunMode = modeOverride ?? runMode
    if (mode === 'scored') {
      /* Practice is the fallback in every failure direction: no bridge, no
         tokens, or a spend that cannot complete all land the student in a
         free race rather than a broken start. */
      const ok = economy ? economy.spendScored() : false
      if (!ok) {
        economy?.toast('No tokens — answering questions earns them. Starting Open Practice.')
        mode = 'practice'
      }
      setRunMode(mode)
      setTokens(economy?.tokens() ?? 0)
    }
    run.current = {
      mode,
      startedAt: performance.now(),
      trackId: track.id,
      weather: activeWeather,
      opponents: n,
      bestLap: null,
      lastLapAt: 0,
    }
    clock.current = { mode, active: mode === 'scored', remaining: SCORED_ACTIVE_SECONDS, idle: 0, lastInput: performance.now() }

    resetOpponents()
    playerMutation.boost = 100
    playerMutation.speed = 0
    mutation.player.lap = 0
    mutation.player.progress = 0
    finishedRef.current = false
    /* The garage's chosen car decides the silhouette and the paint; the
       Intro's local archetype/paint only matter on bench pages with no
       host garage. */
    setPaint(garage ? paintHex : p)
    setArchetype(carSpec ? carSpec.archetype : a)
    setOpponents(n)
    setRunId((r) => r + 1)
    setStartedAt(performance.now())
    setPhase('racing')
  }, [runMode, economy, track, activeWeather, garage, paintHex, carSpec])

  /* C cycles the camera while racing, as v1 did. Kept here rather than in
     useControls because the camera is React state, and this runs only while
     the race is live. */
  useEffect(() => {
    if (phase !== 'racing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyC') return
      const order = ['chase', 'far', 'hood'] as const
      const next = order[(order.indexOf(camMode) + 1) % order.length]
      changeCam(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, camMode, changeCam])

  /* The scored clock. Mirrors v1's session rules in spirit: only ACTIVE
     driving spends the allowance (input within the grace window, or a car
     still carrying speed), a hidden tab spends nothing, and both the
     five-minute cap and the three-minute idle end stop the run WITHOUT
     recording it. The race itself is finite, so this only ever costs a
     player who stops driving. */
  useEffect(() => {
    if (phase !== 'racing') return
    let raf = 0
    let last = performance.now()
    /* v1's exact activity rule: hovering is not driving. Without the buttons
       check, a mouse resting over the page kept the idle timer at zero and
       burned the paid allowance while the player was not actually driving. */
    const onInput = (e: Event) => {
      if (e.type === 'pointermove' && !(e as PointerEvent).buttons) return
      clock.current.lastInput = performance.now()
    }
    const events = ['keydown', 'pointerdown', 'pointermove', 'touchstart']
    events.forEach((e) => document.addEventListener(e, onInput, true))
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((t - last) / 1000, 0.25)
      last = t
      const c = clock.current
      if (!c.active || c.mode !== 'scored') return
      if (document.hidden) return
      const driving = performance.now() - c.lastInput < 600 || playerMutation.speed > 4
      if (driving) {
        c.idle = 0
        c.remaining -= dt
        if (c.remaining <= 0) {
          c.remaining = 0
          c.active = false
          finishRun(true, 'clock')
        }
      } else {
        c.idle += dt
        if (c.idle >= SCORED_IDLE_END_SECONDS) {
          c.active = false
          finishRun(true, 'idle')
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      events.forEach((e) => document.removeEventListener(e, onInput, true))
    }
  }, [phase, finishRun])

  /* Test seam, in the spirit of Vehicle's __rv2probe: the browser test needs
     to finish a race without driving two real laps, and to drive the scored
     clock without waiting five real minutes. This ships in the production
     bundle, so it is deliberately NOT harmless: finish() records the result
     but passes pay=false, because a console call to it during a Scored run
     previously banked a full payout without driving a metre. Payouts come
     only from the real race path. */
  useEffect(() => {
    const w = window as unknown as { __rv2economyProbe?: unknown }
    w.__rv2economyProbe = {
      state: () => ({
        phase: phaseRef.current,
        mode: run.current.mode,
        tokens: economy?.tokens() ?? null,
        remaining: clock.current.remaining,
        result: resultRef.current,
      }),
      finish: (seconds?: number, lap?: number | null) => finishRun(false, null, seconds, lap, false),
      tick: (seconds: number) => {
        const c = clock.current
        if (!c.active || c.mode !== 'scored') return
        c.remaining = Math.max(0, c.remaining - seconds)
        if (c.remaining <= 0) {
          c.active = false
          finishRun(true, 'clock')
        }
      },
    }
    return () => { w.__rv2economyProbe = undefined }
  }, [economy, finishRun])

  /* The player is grid slot 0 -- pole. Same function the field uses, so the
     formation actually agrees. yawForZForward because the raycast vehicle's
     forward is +Z, not the +X the opponents use. */
  const pole = useMemo(() => gridSlot(line, 0, track.grid), [line, track])

  const best = useMemo(
    () => (economy ? economy.best(track.id, activeWeather) : null),
    [economy, track.id, activeWeather],
  )

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
            physics={carConfig ?? undefined}
            camera={camMode}
            volume={volume}
            finish={styleState.finish}
            spoiler={styleState.spoiler}
            neon={styleState.neon}
          />
          <Grid key={`grid-${runId}`} line={line} count={opponents} raceSeed={`${seed}:${runId}`} skill={skill} gates={gates} cornerBudget={track.ai.cornerBudget} grip={grip} />
        </Physics>
      </Canvas>

      {phase === 'racing' && (
        <>
          <Hud line={line} opponents={opponents} startedAt={startedAt} mode={runMode} clock={clock} />
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
          mode={runMode}
          onModeChange={setRunMode}
          tokens={tokens}
          tokenCost={tokenCost}
          affordable={affordable}
          best={best}
          garage={{
            roster, unlocked, selected, cash, tokens, notice,
            tune,
            style: styleState,
            palette: paintPalette,
            wings: garage?.wings() ?? FALLBACK_WINGS,
            finishes: garage?.finishes() ?? FALLBACK_FINISHES,
            ownedWings,
            cam: camMode,
            volume,
            onCar: chooseCar,
            onConvert: convertTokens,
            onTune: changeTune,
            onTuneReset: resetTune,
            onStyle: changeStyle,
            onCam: changeCam,
            onVolume: changeVolume,
          }}
        />
      )}
      {phase === 'finished' && (
        <Finished
          outcome={result}
          trackName={track.name}
          weather={activeWeather}
          tokenCost={tokenCost}
          restartMode={runMode === 'scored' && tokens < tokenCost ? 'practice' : runMode}
          onRestart={() => {
            let mode: RunMode = runMode
            if (mode === 'scored' && (!economy || economy.tokens() < tokenCost)) {
              economy?.toast('Out of tokens — switching to free Open Practice')
              mode = 'practice'
            }
            start({ paint, archetype, opponents }, mode)
          }}
          onQuit={() => onQuit?.()}
        />
      )}
    </div>
  )
}
