import { useEffect, useState } from 'react'
import { readWatchlist, toggleWatch, WATCHLIST_KEY, writeWatchlist } from './watchlist'

export interface Watchlist {
  ids: string[]
  has: (marketId: string) => boolean
  toggle: (marketId: string) => void
  remove: (marketIds: string[]) => void
}

// One watchlist for the whole app (held by App). The storage event keeps
// other tabs of the app in step when one of them changes it.
export function useWatchlist(): Watchlist {
  const [ids, setIds] = useState<string[]>(readWatchlist)

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === WATCHLIST_KEY) {
        setIds(readWatchlist())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  function save(next: string[]) {
    setIds(next)
    writeWatchlist(next)
  }

  return {
    ids,
    has: (marketId) => ids.includes(marketId),
    toggle: (marketId) => save(toggleWatch(ids, marketId)),
    remove: (marketIds) => save(ids.filter((id) => !marketIds.includes(id))),
  }
}
