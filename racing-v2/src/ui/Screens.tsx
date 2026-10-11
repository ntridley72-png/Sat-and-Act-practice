/* Intro (which is also the garage), car picker, help and the finish screen.
 *
 * These are the only UI that uses React state, and correctly so: they change
 * when the player does something, not every frame. The HUD is the opposite
 * case and is updated imperatively.
 *
 * THE INTRO IS THE GARAGE. v2 is the complete replacement for v1, so the
 * progression surface moved here: the car roster with prices (every car but
 * the free starter is bought with cash earned by racing), the tune sliders
 * that change how the car drives, the cosmetics shared with v1's workshop,
 * and the camera/volume settings. Tracks and weather are on the same screen
 * and every track is open from the start.
 */
import { useState } from 'react'
import { PALETTE } from '../ai/Grid'
import { ARCHETYPES } from '../art/ProceduralCar'
import type { TrackDefinition, WeatherId } from '../tracks/format'
import { WEATHER_LABEL } from '../tracks/weather'
import { formatRunTime } from '../economy'
import type { RecordEntry, RunMode } from '../economy'
import { TUNE_RANGE } from '../garage'
import type { CarSpec, TuneSpec } from '../garage'

/** The neon underglow palette, shared with v1's workshop keys. */
const NEON: ReadonlyArray<readonly [string, string]> = [
  ['none', 'None'],
  ['#a855f7', 'Purple'],
  ['#22d3ee', 'Cyan'],
  ['#5ef0b0', 'Mint'],
  ['#f472b6', 'Pink'],
]

export interface GarageView {
  /** null = the roster is loading; [] = no host garage (bench pages). */
  roster: CarSpec[] | null
  unlocked: string[]
  selected: string
  cash: number
  tokens: number
  /** A garage hint (insufficient cash, refused purchase). */
  notice: string | null
  tune: TuneSpec
  style: { paint: string; finish: string; spoiler: string; neon: string }
  palette: Record<string, string> | null
  wings: Record<string, { name: string; price: number }>
  finishes: Record<string, string>
  ownedWings: string[]
  cam: 'chase' | 'far' | 'hood'
  volume: number
  onCar: (id: string) => void
  onConvert: (all: boolean) => void
  onTune: (key: keyof TuneSpec, value: number) => void
  onTuneReset: () => void
  onStyle: (patch: { paint?: string; finish?: string; spoiler?: string; neon?: string }) => void
  onCam: (mode: 'chase' | 'far' | 'hood') => void
  onVolume: (v: number) => void
}

export interface IntroProps {
  onStart: (opts: { paint: string; archetype: string; opponents: number }) => void
  /* Seeded from the mount options so a host that asks for a 12-car grid gets
     one. An earlier version hardcoded these defaults, which silently ignored
     whatever the caller requested -- the bench asked for 12 opponents and
     raced 6, and nothing reported a problem. */
  initialPaint?: string
  initialArchetype?: string
  initialOpponents?: number
  /** The circuits on offer, the current pick, and the change handler. */
  tracks: TrackDefinition[]
  trackId: string
  onTrackChange: (id: string) => void
  /** Weather variants the selected track supports (always >= 1). */
  weatherOptions: WeatherId[]
  weather: WeatherId
  onWeatherChange: (w: WeatherId) => void
  /** The session economy: practice is free, a scored run costs a token. */
  mode: RunMode
  onModeChange: (m: RunMode) => void
  tokens: number
  tokenCost: number
  affordable: boolean
  /** Best recorded run on this track in this weather, if any. */
  best: RecordEntry | null
  /** The garage. */
  garage: GarageView
}

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }
const CAM_LABEL: Record<string, string> = { chase: 'Chase', far: 'Far', hood: 'Cockpit' }
const TUNE_LABEL: Record<keyof TuneSpec, string> = {
  power: 'Power',
  grip: 'Grip',
  weight: 'Weight',
  handbrake: 'Handbrake',
}
const TUNE_NOTE: Record<keyof TuneSpec, string> = {
  power: 'More acceleration.',
  grip: 'More traction; resists sliding.',
  weight: 'Lighter reacts faster, less settled.',
  handbrake: 'Stronger rear breakaway for drifts.',
}

function TuneSliders({ tune, onTune, onReset }: { tune: TuneSpec; onTune: (k: keyof TuneSpec, v: number) => void; onReset: () => void }) {
  return (
    <>
      {(Object.keys(TUNE_LABEL) as (keyof TuneSpec)[]).map((key) => (
        <div className="rv2-field" key={key}>
          <label className="rv2-field-label" htmlFor={`rv2-tune-${key}`}>
            {TUNE_LABEL[key]} <strong>{tune[key].toFixed(2)}</strong>
          </label>
          <input
            id={`rv2-tune-${key}`}
            type="range"
            min={TUNE_RANGE.min}
            max={TUNE_RANGE.max}
            step={0.05}
            value={tune[key]}
            onChange={(e) => onTune(key, Number(e.target.value))}
            className="rv2-range"
          />
          <p className="rv2-note">{TUNE_NOTE[key]}</p>
        </div>
      ))}
      <button type="button" className="rv2-ghost rv2-reset" onClick={onReset}>Reset safe setup</button>
    </>
  )
}

export function Intro({ onStart, initialPaint, initialArchetype, initialOpponents, tracks, trackId, onTrackChange, weatherOptions, weather, onWeatherChange, mode, onModeChange, tokens, tokenCost, affordable, best, garage }: IntroProps) {
  /* Bench fallbacks (no host garage): the raw archetype and paint chips. */
  const [paint, setPaint] = useState<string>(initialPaint ?? PALETTE[0])
  const [archetype, setArchetype] = useState<string>(initialArchetype ?? 'sport')
  const [opponents, setOpponents] = useState(initialOpponents ?? 6)
  const track = tracks.find((t) => t.id === trackId) ?? tracks[0]
  const hasGarage = garage.roster !== null && garage.roster.length > 0

  const paintOptions = garage.palette
    ? Object.keys(garage.palette).map((k) => ({ key: k, hex: garage.palette![k] }))
    : PALETTE.map((h) => ({ key: h, hex: h }))

  return (
    <div className="rv2-screen">
      <div className="rv2-panel">
        <h1 className="rv2-title">{track ? track.name : 'Race'}</h1>
        <p className="rv2-sub">{track ? track.blurb : 'A quick race.'} Arrow keys or WASD, Shift to boost, Space to handbrake.</p>

        <div className="rv2-field">
          <span className="rv2-field-label">Track</span>
          <div className="rv2-chips">
            {tracks.map((t) => (
              <button
                key={t.id}
                type="button"
                className={'rv2-chip' + (t.id === trackId ? ' is-on' : '')}
                onClick={() => onTrackChange(t.id)}
                title={`${t.name} — ${DIFFICULTY_LABEL[t.difficulty]}`}
              >
                {t.name}
              </button>
            ))}
          </div>
          <p className="rv2-note">All six tracks are open from the start.</p>
        </div>

        {weatherOptions.length > 1 && (
          <div className="rv2-field">
            <span className="rv2-field-label">Weather</span>
            <div className="rv2-chips">
              {weatherOptions.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={'rv2-chip' + (w === weather ? ' is-on' : '')}
                  onClick={() => onWeatherChange(w)}
                >
                  {WEATHER_LABEL[w]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rv2-field">
          <span className="rv2-field-label">Mode</span>
          <div className="rv2-chips">
            <button
              type="button"
              className={'rv2-chip' + (mode === 'practice' ? ' is-on' : '')}
              onClick={() => onModeChange('practice')}
            >
              Open Practice
            </button>
            <button
              type="button"
              className={'rv2-chip' + (mode === 'scored' ? ' is-on' : '')}
              disabled={!affordable}
              title={affordable ? 'One token for a scored run; best race and lap are recorded' : 'Answer questions to earn a token'}
              onClick={() => onModeChange('scored')}
            >
              Scored run · {tokenCost} token{tokenCost === 1 ? '' : 's'}
            </button>
          </div>
          <p className="rv2-note">
            {mode === 'scored'
              ? 'Scored run: five minutes of driving; the run is recorded and pays cash.'
              : 'Open Practice is free and unlimited — nothing recorded, no cash.'}
            {' '}You have <strong>{tokens}</strong> token{tokens === 1 ? '' : 's'}.
            {!affordable && ' Answer questions to earn more.'}
          </p>
        </div>

        {best && best.race != null && (
          <p className="rv2-note rv2-best">
            Best here ({WEATHER_LABEL[weather]}): race {formatRunTime(best.race)}
            {best.lap != null ? ` · lap ${formatRunTime(best.lap)}` : ''}
          </p>
        )}

        {garage.roster === null && <p className="rv2-note">Loading garage…</p>}

        {hasGarage && (
          <div className="rv2-field">
            <span className="rv2-field-label">
              Garage · <strong>${garage.cash.toLocaleString()}</strong>
            </span>
            <div className="rv2-chips rv2-convert">
              <button type="button" className="rv2-chip" disabled={garage.tokens < 1} onClick={() => garage.onConvert(false)}>
                1 token → $250
              </button>
              <button type="button" className="rv2-chip" disabled={garage.tokens < 1} onClick={() => garage.onConvert(true)}>
                Convert all ({garage.tokens})
              </button>
            </div>
            <div className="rv2-cars">
              {garage.roster!.map((c) => {
                const owned = garage.unlocked.includes(c.id)
                const on = c.id === garage.selected
                const afford = garage.cash >= c.price
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={'rv2-car' + (on ? ' is-on' : '') + (owned ? '' : ' is-locked')}
                    disabled={!owned && !afford}
                    title={owned ? c.name : `${c.name} — unlock for $${c.price.toLocaleString()}; earn cash by racing`}
                    onClick={() => garage.onCar(c.id)}
                  >
                    <b>{c.name}</b>
                    <small>{owned ? (on ? 'Selected' : 'Owned') : `$${c.price.toLocaleString()}`}</small>
                  </button>
                )
              })}
            </div>
            {garage.notice && <p className="rv2-note rv2-warn">{garage.notice}</p>}
            <p className="rv2-note">Every car but the starter is earned: finish scored runs to bank cash.</p>
          </div>
        )}

        {!hasGarage && garage.roster !== null && (
          <>
            <div className="rv2-field">
              <span className="rv2-field-label">Car</span>
              <div className="rv2-chips">
                {ARCHETYPES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={'rv2-chip' + (a === archetype ? ' is-on' : '')}
                    onClick={() => setArchetype(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className="rv2-field">
              <span className="rv2-field-label">Paint</span>
              <div className="rv2-swatches">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Paint ${c}`}
                    aria-pressed={c === paint}
                    className={'rv2-swatch' + (c === paint ? ' is-on' : '')}
                    style={{ background: c }}
                    onClick={() => setPaint(c)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {hasGarage && (
          <>
            <details className="rv2-details">
              <summary>Style</summary>
              <div className="rv2-field">
                <span className="rv2-field-label">Paint</span>
                <div className="rv2-swatches">
                  {paintOptions.map(({ key, hex }) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={`Paint ${key}`}
                      aria-pressed={garage.style.paint === key}
                      className={'rv2-swatch' + (garage.style.paint === key ? ' is-on' : '')}
                      style={{ background: hex }}
                      onClick={() => garage.onStyle({ paint: key })}
                    />
                  ))}
                </div>
              </div>
              <div className="rv2-field">
                <span className="rv2-field-label">Finish</span>
                <div className="rv2-chips">
                  {Object.keys(garage.finishes).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={'rv2-chip' + (garage.style.finish === k ? ' is-on' : '')}
                      onClick={() => garage.onStyle({ finish: k })}
                    >
                      {garage.finishes[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rv2-field">
                <span className="rv2-field-label">Spoiler</span>
                <div className="rv2-chips">
                  {Object.keys(garage.wings).map((k) => {
                    const w = garage.wings[k]
                    const owned = garage.ownedWings.includes(k)
                    return (
                      <button
                        key={k}
                        type="button"
                        className={'rv2-chip' + (garage.style.spoiler === k ? ' is-on' : '')}
                        onClick={() => garage.onStyle({ spoiler: k })}
                      >
                        {w.name}
                        {!owned && w.price > 0 ? ` · $${w.price}` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="rv2-field">
                <span className="rv2-field-label">Underglow</span>
                <div className="rv2-swatches">
                  {NEON.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={`Neon ${label}`}
                      aria-pressed={garage.style.neon === key}
                      className={'rv2-swatch' + (garage.style.neon === key ? ' is-on' : '')}
                      style={{ background: key === 'none' ? '#1e293b' : key }}
                      onClick={() => garage.onStyle({ neon: key })}
                    />
                  ))}
                </div>
              </div>
            </details>

            <details className="rv2-details">
              <summary>Tuning</summary>
              <TuneSliders tune={garage.tune} onTune={garage.onTune} onReset={garage.onTuneReset} />
            </details>
          </>
        )}

        <div className="rv2-field">
          <span className="rv2-field-label">View · volume {Math.round(garage.volume * 100)}%</span>
          <div className="rv2-chips">
            {(['chase', 'far', 'hood'] as const).map((c) => (
              <button
                key={c}
                type="button"
                className={'rv2-chip' + (garage.cam === c ? ' is-on' : '')}
                onClick={() => garage.onCam(c)}
              >
                {CAM_LABEL[c]}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={garage.volume}
            onChange={(e) => garage.onVolume(Number(e.target.value))}
            className="rv2-range"
            aria-label="Engine volume"
          />
          <p className="rv2-note">Press C while driving to cycle the view.</p>
        </div>

        <div className="rv2-field">
          <label className="rv2-field-label" htmlFor="rv2-grid">
            Opponents <strong>{opponents}</strong>
          </label>
          <input
            id="rv2-grid"
            type="range"
            min={0}
            max={12}
            value={opponents}
            onChange={(e) => setOpponents(Number(e.target.value))}
            className="rv2-range"
          />
        </div>

        <button type="button" className="rv2-go" onClick={() => onStart({ paint, archetype, opponents })}>
          Race
        </button>

        <p className="rv2-foot">
          Original procedural artwork. Code from pmndrs/racing-game under MIT.
        </p>
      </div>
    </div>
  )
}

export interface FinishedProps {
  outcome: {
    time: string
    position: number
    total: number
    mode: RunMode
    timeUp: boolean
    endReason: 'clock' | 'idle' | null
    recorded: boolean
    improvedRace: boolean
    improvedLap: boolean
    best: RecordEntry | null
    lap: string | null
  }
  trackName: string
  weather: WeatherId
  /** What the next run will cost, after the broke-player downgrade. */
  restartMode: RunMode
  tokenCost: number
  onRestart: () => void
  onQuit: () => void
}

export function Finished({ outcome, trackName, weather, restartMode, tokenCost, onRestart, onQuit }: FinishedProps) {
  const { time, position, total, mode, timeUp, endReason, recorded, improvedRace, improvedLap, best, lap } = outcome
  return (
    <div className="rv2-screen">
      <div className="rv2-panel rv2-panel-sm">
        <h2 className="rv2-title">Finished</h2>
        <p className="rv2-result">
          <strong>P{position}</strong> of {total}
        </p>
        <p className="rv2-sub">
          Race time {time}
          {lap ? ` · best lap ${lap}` : ''}
        </p>
        {mode === 'practice' && (
          <p className="rv2-note">Open Practice — not scored. Start a scored run to set a record.</p>
        )}
        {mode === 'scored' && timeUp && (
          <p className="rv2-note">
            {endReason === 'idle' ? 'Ended after three idle minutes' : 'Five-minute allowance used'} — this run was not recorded.
          </p>
        )}
        {mode === 'scored' && recorded && (
          <p className="rv2-note">
            {improvedRace || improvedLap ? 'New record! ' : 'Recorded. '}
            {best && best.race != null && (
              <>
                {trackName} ({WEATHER_LABEL[weather]}): best race {formatRunTime(best.race)}
                {best.lap != null ? ` · best lap ${formatRunTime(best.lap)}` : ''}
              </>
            )}
          </p>
        )}
        <div className="rv2-actions">
          <button type="button" className="rv2-go" onClick={onRestart}>
            Race again{restartMode === 'scored' ? ` · ${tokenCost} token` : ' · free'}
          </button>
          <button type="button" className="rv2-ghost" onClick={onQuit}>Back to the arcade</button>
        </div>
      </div>
    </div>
  )
}

/** Key hints. Collapsed by default so it does not sit over the road. */
export function Help() {
  const [open, setOpen] = useState(false)
  return (
    <div className={'rv2-help' + (open ? ' is-open' : '')}>
      <button type="button" className="rv2-help-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Hide keys' : 'Keys'}
      </button>
      {open && (
        <dl className="rv2-keys">
          <div><dt>W / Up</dt><dd>Accelerate</dd></div>
          <div><dt>S / Down</dt><dd>Brake / reverse</dd></div>
          <div><dt>A D / Left Right</dt><dd>Steer</dd></div>
          <div><dt>Space</dt><dd>Handbrake</dd></div>
          <div><dt>Shift</dt><dd>Boost</dd></div>
          <div><dt>C</dt><dd>Camera</dd></div>
          <div><dt>R</dt><dd>Reset</dd></div>
        </dl>
      )}
    </div>
  )
}
