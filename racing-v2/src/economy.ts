/* The scored-run economy, from the game's side.
 *
 * v2 is the game now, so it carries the v1 session rules: Open Practice is
 * free and never recorded; a Scored run costs one token, has a five-minute
 * ACTIVE-driving allowance, and its result is banked as a record.
 *
 * This module holds what the React app needs to know and nothing that belongs
 * to the host: the constants, the bridge TYPES, and the display formatting.
 * The authoritative record math (token spend, best-so-far merge) lives in the
 * vanilla bridge (racing/index.js) because that is where the profile lives;
 * duplicating it here to unit-test a copy would test the copy, not the game.
 * The browser test (tests/racing-v2-economy.cjs) exercises the real bridge.
 */

/** Five minutes of active driving per token, matching v1 (session.js MAX_SEC). */
export const SCORED_ACTIVE_SECONDS = 300

/** A run sits idle this long and stops counting, as in v1 — but v2 races are
 *  finite, so this only guards a player who stops driving mid-race. */
export const SCORED_IDLE_END_SECONDS = 180

export type RunMode = 'practice' | 'scored'

export interface RecordEntry {
  race: number | null
  raceAt: string | null
  lap: number | null
  lapAt: string | null
  position: number | null
}

export interface RunResult {
  race: number
  lap: number | null
  position: number
}

export interface RecordOutcome {
  entry: RecordEntry | null
  improvedRace: boolean
  improvedLap: boolean
}

/** What racing/index.js hands to mount(). Every method must be treated as
 *  fallible: the host guards its side, and the game guards its own. */
export interface EconomyBridge {
  /** 'scored' only when a workshop button asked for it and it is affordable. */
  initialMode: RunMode
  tokenCost: number
  tokens(): number
  spendScored(): boolean
  best(trackId: string, weather: string): RecordEntry | null
  record(trackId: string, weather: string, run: RunResult): RecordOutcome
  toast(message: string): void
}

/** "1:23.45" — race and lap times on the finish screens. */
export function formatRunTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds * 100) % 100)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}
