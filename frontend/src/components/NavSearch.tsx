import { useMemo, useState } from 'react'
import { searchMarkets } from '../features/markets/discovery'
import type { OutcomeMarket } from '../types/market'
import { formatVolume } from '../utils/format'

interface NavSearchProps {
  markets: OutcomeMarket[]
  onSelect: (marketId: string) => void
}

const MAX_RESULTS = 8

// Milestone 29.0: the search box in the navigation row. Typing lists the
// best matches (busiest first); choosing one opens it in the detail
// panel. It does not filter the market list underneath.
function NavSearch({ markets, onSelect }: NavSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    if (query.trim() === '') {
      return []
    }
    return [...searchMarkets(markets, query)]
      .sort((a, b) => (b.volume24h ?? -1) - (a.volume24h ?? -1))
      .slice(0, MAX_RESULTS)
  }, [markets, query])
  const total = query.trim() === '' ? 0 : searchMarkets(markets, query).length

  function choose(marketId: string) {
    onSelect(marketId)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="nav-search">
      <input
        type="search"
        aria-label="Search markets"
        placeholder="Search markets"
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
          } else if (event.key === 'Enter' && results.length > 0) {
            choose(results[0].id)
          }
        }}
      />
      {open && query.trim() !== '' && (
        // preventDefault keeps focus in the box, so a click on a result
        // lands before the box's blur closes the list.
        <div className="nav-search-results" onMouseDown={(event) => event.preventDefault()}>
          {results.length === 0 ? (
            <p className="nav-search-empty">No market matches “{query.trim()}”.</p>
          ) : (
            <ul>
              {results.map((market) => (
                <li key={market.id}>
                  <button type="button" onClick={() => choose(market.id)}>
                    <span>{market.question}</span>
                    <small>
                      {market.parent !== null && `${market.parent.outcomeLabel} · `}
                      #{market.id} · 24h {formatVolume(market.volume24h)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {total > results.length && (
            <p className="nav-search-empty">Showing the {results.length} busiest of {total} matches. Keep typing to narrow.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default NavSearch
