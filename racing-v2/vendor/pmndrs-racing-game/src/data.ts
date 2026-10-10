// Supabase and auth were removed from this vendored game (see MODIFICATIONS.md).
// This project is a student-facing study app: no third-party backend, no auth,
// and the leaderboard must be local-only.

interface IScore {
  name: string
  thumbnail: string
  time: number
}

export interface SavedScore extends IScore {
  id: string
}

// TODO(local-leaderboard): getScores must read from the existing local store
// (src/store.ts) instead of a remote backend. store.ts does not persist scores
// yet, and rather than invent a new persistence layer this returns an empty
// list so the leaderboard renders empty.
export const getScores = (limit = 50): PromiseLike<SavedScore[]> => Promise.resolve([])
