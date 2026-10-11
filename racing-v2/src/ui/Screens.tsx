/* Intro, car picker, help and the finish screen.
 *
 * These are the only UI that uses React state, and correctly so: they change
 * when the player does something, not every frame. The HUD is the opposite
 * case and is updated imperatively.
 */
import { useState } from 'react'
import { PALETTE } from '../ai/Grid'
import { ARCHETYPES } from '../art/ProceduralCar'
import type { TrackDefinition, WeatherId } from '../tracks/format'
import { WEATHER_LABEL } from '../tracks/weather'
import { formatRunTime } from '../economy'
import type { RecordEntry, RunMode } from '../economy'

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
}

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }

export function Intro({ onStart, initialPaint, initialArchetype, initialOpponents, tracks, trackId, onTrackChange, weatherOptions, weather, onWeatherChange, mode, onModeChange, tokens, tokenCost, affordable, best }: IntroProps) {
  const [paint, setPaint] = useState<string>(initialPaint ?? PALETTE[0])
  const [archetype, setArchetype] = useState<string>(initialArchetype ?? 'sport')
  const [opponents, setOpponents] = useState(initialOpponents ?? 6)
  const track = tracks.find((t) => t.id === trackId) ?? tracks[0]

  return (
    <div className="rv2-screen">
      <div className="rv2-panel">
        <h1 className="rv2-title">{track ? track.name : 'Race'}</h1>
        <p className="rv2-sub">{track ? track.blurb : 'A quick race.'} Arrow keys or WASD, Shift to boost, Space to brake.</p>

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
              ? 'Scored run: five minutes of driving; your best race and lap are recorded.'
              : 'Open Practice is free and unlimited — nothing is recorded.'}
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
          <div><dt>S / Down</dt><dd>Reverse</dd></div>
          <div><dt>A D / Left Right</dt><dd>Steer</dd></div>
          <div><dt>Space</dt><dd>Brake</dd></div>
          <div><dt>Shift</dt><dd>Boost</dd></div>
          <div><dt>R</dt><dd>Reset</dd></div>
        </dl>
      )}
    </div>
  )
}
