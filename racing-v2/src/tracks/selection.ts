/* Track selection persistence.
 *
 * The chosen circuit survives reloads under one localStorage key. Every
 * access is wrapped: the game is optional UI inside a study site, and a
 * storage failure (privacy mode, quota, disabled storage) must degrade to the
 * default track, never throw into the page. Readers get a raw id back; the
 * catalog's trackById() is what turns it into a validated circuit, with the
 * default as its fallback.
 */
const KEY = 'funsat.racing.track'

export function readSavedTrack(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveTrack(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* selection is a convenience, not a feature that may break the game */
  }
}
