import { useEffect, useState, type ReactNode } from "react"
import { useMarketDetail, useMarkets } from "./api/queries"
import AccountPage from "./components/AccountPage"
import ActiveFilters, { type ActiveFilter } from "./components/ActiveFilters"
import ChipFilter from "./components/ChipFilter"
import CloseBucketFilter from "./components/CloseBucketFilter"
import DeployerDirectory from "./components/DeployerDirectory"
import FeedTicker from "./components/FeedTicker"
import LeaderboardPanel from "./components/LeaderboardPanel"
import LeaderboardTable from "./components/LeaderboardTable"
import MarketDetail from "./components/MarketDetail"
import MarketList from "./components/MarketList"
import MarketSort from "./components/MarketSort"
import NavBar, { type AppView } from "./components/NavBar"
import SettingsPage from "./components/SettingsPage"
import TraderDashboard from "./components/TraderDashboard"
import WalletButton from "./components/WalletButton"
import WatchButton from "./components/WatchButton"
import {
  CLOSE_FILTER_LABELS,
  countByVenue,
  countCloseBuckets,
  filterByCloseBucket,
  filterByVenue,
  listVenues,
  sortEntries,
  venueLabel,
  type CloseFilter,
  type SortMode,
} from "./features/markets/discovery"
import { groupEntries } from "./features/markets/grouping"
import { countByTab, filterByTab, MARKET_TABS, type MarketTab } from "./features/markets/tabs"
import { useWatchlist } from "./features/markets/useWatchlist"
import { readTraderLocation, traderHref } from "./features/trader/url"
import { TESTNET } from "./features/trading/client"
import { useWallet } from "./features/wallet/useWallet"
import { useNow } from "./hooks/useNow"
import type { LeaderboardWindow } from "./types/leaderboard"

// Bucket boundaries are hours and days apart; re-evaluating them once
// a minute is far more precise than they need.
const CLOCK_TICK_MS = 60_000

// Milestone 29.0: the landing page. One header row (brand, wallet,
// settings), the feed strip, one navigation row (watchlist, market tabs,
// search, pages), then the current page. Markets, Watchlist and HIP-4
// Deployers share the list + detail layout; Active Positions and
// Settings are full-width pages.
function App() {
  const [selectedMarketId, setSelectedMarketId] =
    useState<string | null>(null)
  const [closeFilter, setCloseFilter] = useState<CloseFilter>("all")
  const [sortMode, setSortMode] = useState<SortMode>("default")
  // null = all deployers; "" = markets with no venue.
  const [venueFilter, setVenueFilter] = useState<string | null>(null)
  // A shared ?trader= link opens straight into the Leaderboard view (26.3).
  const [view, setView] = useState<AppView>(() =>
    readTraderLocation() !== null ? "leaderboard" : "markets",
  )
  const [tab, setTab] = useState<MarketTab>("trending")
  // Leaderboard kept here, not inside the view, b/c sidebar and workspace
  // table both need it
  const [leaderboardWindow, setLeaderboardWindow] =
    useState<LeaderboardWindow>("7d")
  // The trader dashboard (26.3): which trader is open, and its window.
  // Both mirror the URL (?trader=0x…&window=30d), read once at start.
  const [selectedTrader, setSelectedTrader] = useState<string | null>(
    () => readTraderLocation()?.address ?? null,
  )
  const [traderWindow, setTraderWindow] = useState<LeaderboardWindow>(
    () => readTraderLocation()?.window ?? "30d",
  )

  // Back / Forward change the URL without reloading; popstate is how the
  // app hears about it, and the URL is then the source of truth.
  useEffect(() => {
    function handlePopState() {
      const location = readTraderLocation()
      setSelectedTrader(location?.address ?? null)
      if (location !== null) {
        setTraderWindow(location.window)
        setView("leaderboard")
      }
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const now = useNow(CLOCK_TICK_MS)
  const wallet = useWallet()
  const watchlist = useWatchlist()
  const marketsQuery = useMarkets()
  const detailQuery = useMarketDetail(selectedMarketId)

  const markets = marketsQuery.data ?? []

  // Discovery pipeline, all derived on every render:
  //   tab -> deployer + time filters -> group -> sort
  // Faceted counts: the deployer chips count markets that pass the time
  // filter, and the time chips count markets that pass the deployer
  // filter, both within the current tab.
  const tabMarkets = filterByTab(markets, tab)
  const byVenue = filterByVenue(tabMarkets, venueFilter)
  const byTime = filterByCloseBucket(tabMarkets, closeFilter, now)
  const venueCounts = countByVenue(byTime)
  const closeCounts = countCloseBuckets(byVenue, now)
  // Chip order comes from the full list so it doesn't jump around.
  const venues = listVenues(markets)
  // Trending is "every market by 24h volume", so it ignores the sort menu.
  const effectiveSort: SortMode = tab === "trending" ? "trending" : sortMode
  const visibleMarkets = filterByCloseBucket(byVenue, closeFilter, now)
  const entries = sortEntries(
    groupEntries(visibleMarkets, markets),
    effectiveSort,
    now,
  )

  // The watchlist, in the same card layout. Starred markets that have
  // settled drop out of the live list; they are counted, not hidden.
  const watchedMarkets = markets.filter((market) => watchlist.has(market.id))
  const watchedEntries = sortEntries(groupEntries(watchedMarkets, markets), "default", now)
  const unlistedWatched = marketsQuery.data === undefined
    ? []
    : watchlist.ids.filter((id) => !markets.some((market) => market.id === id))

  // Errors only matter when there is no data to show. A failed
  // background refetch keeps the last good data on screen.
  const listError =
    marketsQuery.data === undefined && marketsQuery.error !== null
      ? marketsQuery.error.message
      : null

  const detail = detailQuery.data ?? null
  const detailError =
    detail === null && detailQuery.error !== null
      ? detailQuery.error.message
      : null

  // A market can settle and drop out of the refreshed list while it is
  // selected. The detail response is an OutcomeMarket too, so it keeps
  // the panel populated. Looked up in the full list, so changing tabs
  // never closes the market being inspected.
  const selectedMarket =
    markets.find((market) => market.id === selectedMarketId) ?? detail

  // Leaving the leaderboard closes an open trader dashboard and its URL.
  function closeTraderUrl() {
    if (selectedTrader !== null) {
      setSelectedTrader(null)
      window.history.replaceState(null, "", traderHref(null))
    }
  }

  function handleView(next: AppView) {
    setView(next)
    if (next !== "leaderboard") {
      closeTraderUrl()
    }
  }

  function handleTab(next: MarketTab) {
    setTab(next)
    handleView("markets")
  }

  function handleSelectMarket(marketId: string) {
    setSelectedMarketId(marketId)
  }

  // Search, the feed and dashboards open a market in the detail panel.
  // Pages without one (positions, settings, leaderboard) switch to Markets.
  function openMarket(marketId: string) {
    setSelectedMarketId(marketId)
    if (view !== "markets" && view !== "watchlist" && view !== "deployers") {
      handleView("markets")
    }
  }

  // Trader dashboard navigation (26.3). Opening or leaving a dashboard
  // adds a history entry (pushState), so Back returns to where you were;
  // changing its window only rewrites the current entry (replaceState).
  function handleOpenTrader(address: string) {
    setSelectedTrader(address)
    setTraderWindow(leaderboardWindow)
    window.history.pushState(null, "", traderHref({ address, window: leaderboardWindow }))
  }

  // Your own account (27.2) is a trader dashboard like any other: the backend
  // serves it by address, so no new endpoint is needed
  function handleOpenMyDashboard(address: string) {
    setView("leaderboard")
    handleOpenTrader(address)
  }

  function handleTraderWindowChange(next: LeaderboardWindow) {
    setTraderWindow(next)
    if (selectedTrader !== null) {
      window.history.replaceState(null, "", traderHref({ address: selectedTrader, window: next }))
    }
  }

  function handleCloseTrader() {
    setSelectedTrader(null)
    window.history.pushState(null, "", traderHref(null))
  }

  // A market in the dashboard opens in the Markets view; Back returns to
  // the dashboard, because the dashboard's URL is the previous entry.
  function handleOpenMarketFromTrader(marketId: string) {
    setView("markets")
    setSelectedMarketId(marketId)
    setSelectedTrader(null)
    window.history.pushState(null, "", traderHref(null))
  }

  // Every filter currently narrowing the list, each with its own way to
  // undo it (Milestone 20.1d). The tab is not listed: it is always
  // visible in the navigation row.
  const activeFilters: ActiveFilter[] = []
  if (venueFilter !== null) {
    activeFilters.push({
      key: "deployer",
      label: `Deployer: ${venueLabel(venueFilter)}`,
      onRemove: () => setVenueFilter(null),
    })
  }
  if (closeFilter !== "all") {
    activeFilters.push({
      key: "time",
      label: `Time: ${CLOSE_FILTER_LABELS[closeFilter]}`,
      onRemove: () => setCloseFilter("all"),
    })
  }

  function resetFilters() {
    setVenueFilter(null)
    setCloseFilter("all")
  }

  // Choosing a deployer reuses the 17.4 deployer filter, then shows the
  // whole market list (Trending) it now filters.
  function handleSelectVenue(venue: string) {
    setVenueFilter(venue)
    setTab("trending")
    setView("markets")
  }

  let workspaceTitle = "Select a market"
  let workspaceMessage =
    "Choose a market from the list, or search for one above, to inspect its details"

  if (marketsQuery.isPending) {
    workspaceTitle = "Loading markets"
    workspaceMessage = "Waiting for market data from the API"
  } else if (listError !== null) {
    workspaceTitle = "Markets unavailable"
    workspaceMessage = listError
  }

  const tabLabel = MARKET_TABS.find((item) => item.value === tab)?.label ?? "Markets"

  // The detail panel used by Markets, Watchlist and HIP-4 Deployers.
  const detailPanel =
    selectedMarket !== null ? (
      <>
        <div className="detail-toolbar">
          <WatchButton
            watched={watchlist.has(selectedMarket.id)}
            onToggle={() => watchlist.toggle(selectedMarket.id)}
          />
        </div>
        <MarketDetail
          market={selectedMarket}
          detail={detail}
          detailError={detailError}
          onSelectMarket={handleSelectMarket}
        />
      </>
    ) : (
      <div className="market-detail-empty">
        <h2>{workspaceTitle}</h2>
        <p>{workspaceMessage}</p>
      </div>
    )

  const marketStatus = marketsQuery.isPending ? (
    <p className="request-status">Loading markets...</p>
  ) : listError !== null ? (
    <div className="request-status request-status--error">
      <strong>Failed to load markets</strong>
      <p>{listError}</p>
    </div>
  ) : null

  let sidebar: ReactNode = null
  let workspace: ReactNode = detailPanel
  if (view === "markets") {
    sidebar = marketStatus ?? (
      <>
        <div className="market-controls">
          <ActiveFilters filters={activeFilters} onResetAll={resetFilters} />
          <ChipFilter
            label="Deployer"
            options={venues}
            counts={venueCounts}
            totalCount={byTime.length}
            value={venueFilter}
            onChange={setVenueFilter}
            formatLabel={venueLabel}
          />
          <CloseBucketFilter value={closeFilter} onChange={setCloseFilter} counts={closeCounts} />
          {tab !== "trending" && <MarketSort value={sortMode} onChange={setSortMode} />}
        </div>
        <MarketList
          title={tab === "trending" ? "Trending · 24h volume" : tabLabel}
          entries={entries}
          selectedMarketId={selectedMarketId}
          onSelect={handleSelectMarket}
        />
      </>
    )
  } else if (view === "watchlist") {
    sidebar = marketStatus ?? (
      <>
        {watchlist.ids.length === 0 && (
          <p className="request-status">
            No markets on your watchlist yet. Open a market and press “Add to watchlist”.
          </p>
        )}
        {unlistedWatched.length > 0 && (
          <p className="watchlist-unlisted">
            {unlistedWatched.length} watched market{unlistedWatched.length === 1 ? " is" : "s are"} no
            longer listed (settled or removed).{" "}
            <button type="button" className="wallet-secondary" onClick={() => watchlist.remove(unlistedWatched)}>
              Remove {unlistedWatched.length === 1 ? "it" : "them"}
            </button>
          </p>
        )}
        <MarketList
          title="Watchlist"
          entries={watchedEntries}
          selectedMarketId={selectedMarketId}
          onSelect={handleSelectMarket}
        />
      </>
    )
  } else if (view === "deployers") {
    sidebar = <DeployerDirectory activeVenue={venueFilter} onSelectVenue={handleSelectVenue} />
  } else if (view === "leaderboard") {
    sidebar = <LeaderboardPanel timeWindow={leaderboardWindow} onWindowChange={setLeaderboardWindow} />
    workspace =
      selectedTrader !== null ? (
        <TraderDashboard
          address={selectedTrader}
          timeWindow={traderWindow}
          onWindowChange={handleTraderWindowChange}
          onClose={handleCloseTrader}
          onOpenMarket={handleOpenMarketFromTrader}
        />
      ) : (
        <LeaderboardTable timeWindow={leaderboardWindow} onSelectTrader={handleOpenTrader} />
      )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <h1>CROSS</h1>
          <p className="tagline">Trade Predictions Across Hyperliquid, Polymarket, and Kalshi</p>
        </div>
        <div className="header-actions">
          <WalletButton wallet={wallet} onOpenDashboard={handleOpenMyDashboard} />
          <button
            type="button"
            className={view === "settings" ? "nav-tab nav-tab--active" : "nav-tab"}
            aria-pressed={view === "settings"}
            onClick={() => handleView("settings")}
          >
            Settings
          </button>
        </div>
      </header>

      <FeedTicker onSelectMarket={openMarket} />

      <NavBar
        view={view}
        tab={tab}
        tabCounts={marketsQuery.data === undefined ? null : countByTab(markets)}
        watchCount={watchlist.ids.length}
        markets={markets}
        onView={handleView}
        onTab={handleTab}
        onSearchSelect={openMarket}
      />

      {view === "positions" ? (
        <AccountPage network={TESTNET} master={wallet.address} onOpenSettings={() => handleView("settings")} />
      ) : view === "settings" ? (
        <SettingsPage network={TESTNET} wallet={wallet} />
      ) : (
        <div className="terminal-layout">
          <aside className="market-sidebar">{sidebar}</aside>
          <section className="market-workspace">{workspace}</section>
        </div>
      )}
    </main>
  )
}

export default App
