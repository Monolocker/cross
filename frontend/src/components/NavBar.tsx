import { MARKET_TABS, type MarketTab } from '../features/markets/tabs'
import type { OutcomeMarket } from '../types/market'
import NavSearch from './NavSearch'

// The app's pages (Milestone 29.0). "markets" shows a tab's list.
export type AppView = 'markets' | 'watchlist' | 'positions' | 'deployers' | 'leaderboard' | 'settings'

interface NavBarProps {
  view: AppView
  tab: MarketTab
  tabCounts: Record<MarketTab, number> | null  // null while markets load
  watchCount: number
  markets: OutcomeMarket[]
  onView: (view: AppView) => void
  onTab: (tab: MarketTab) => void
  onSearchSelect: (marketId: string) => void
}

const LINKS: { view: AppView; label: string }[] = [
  { view: 'positions', label: 'Active Positions' },
  { view: 'deployers', label: 'HIP-4 Deployers' },
  { view: 'leaderboard', label: 'Leaderboard' },
]

// Milestone 29.0: one row under the feed: watchlist star, market tabs,
// search, then the account and directory pages.
function NavBar({ view, tab, tabCounts, watchCount, markets, onView, onTab, onSearchSelect }: NavBarProps) {
  return (
    <nav className="nav-bar" aria-label="Main">
      <button
        type="button"
        className={view === 'watchlist' ? 'nav-star nav-star--active' : 'nav-star'}
        aria-pressed={view === 'watchlist'}
        aria-label={`Watchlist (${watchCount})`}
        title={`Watchlist: ${watchCount} market${watchCount === 1 ? '' : 's'}`}
        onClick={() => onView('watchlist')}
      >
        <span aria-hidden="true">{watchCount > 0 ? '★' : '☆'}</span>
        {watchCount > 0 && <span className="nav-count">{watchCount}</span>}
      </button>

      <div className="nav-tabs" role="group" aria-label="Market categories">
        {MARKET_TABS.map((item) => {
          const active = view === 'markets' && tab === item.value
          return (
            <button
              key={item.value}
              type="button"
              className={active ? 'nav-tab nav-tab--active' : 'nav-tab'}
              aria-pressed={active}
              title={item.value === 'trending' ? 'Every market, by 24h volume' : undefined}
              onClick={() => onTab(item.value)}
            >
              {item.label}
              {tabCounts !== null && <span className="nav-count">{tabCounts[item.value]}</span>}
            </button>
          )
        })}
      </div>

      <NavSearch markets={markets} onSelect={onSearchSelect} />

      <div className="nav-links">
        {LINKS.map((link) => (
          <button
            key={link.view}
            type="button"
            className={view === link.view ? 'nav-tab nav-tab--active' : 'nav-tab'}
            aria-pressed={view === link.view}
            onClick={() => onView(link.view)}
          >
            {link.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export default NavBar
