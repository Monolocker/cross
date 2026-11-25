// The watchlist (Milestone 29.0): market ids the user starred, kept in
// this browser's localStorage. Only public market ids are stored.
// localStorage can be unavailable (privacy modes) or hold junk written
// by an older version, so every read and write is guarded.

export const WATCHLIST_KEY = 'cross.watchlist'

export function parseWatchlist(raw: string | null): string[] {
  if (raw === null) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    const ids = parsed.filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id))
    return [...new Set(ids)]
  } catch {
    return []
  }
}

// Newest star first; starring again removes it.
export function toggleWatch(ids: string[], marketId: string): string[] {
  return ids.includes(marketId) ? ids.filter((id) => id !== marketId) : [marketId, ...ids]
}

export function readWatchlist(): string[] {
  try {
    return parseWatchlist(window.localStorage.getItem(WATCHLIST_KEY))
  } catch {
    return []
  }
}

export function writeWatchlist(ids: string[]): void {
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(ids))
  } catch {
    // Not saved: the star still works for this visit.
  }
}
