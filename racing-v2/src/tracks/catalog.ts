/* The shipped track catalog.
 *
 * Schema phase: intentionally empty for this commit. The tracks land in the
 * next commit, first with APEX_FLATS adapted from src/ai/racingLine.ts (the
 * round-trip proof), then the new circuits.
 */
import type { TrackDefinition } from './format'

export const TRACKS: TrackDefinition[] = []

/** Null until the adapted circuit lands. */
export const DEFAULT_TRACK_ID: string | null = null
