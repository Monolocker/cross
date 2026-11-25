import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { applyFilters, filterOptions, positionRows, sortByValue, type RowKey } from '../features/trading/account'
import { readAgent } from '../features/trading/agentStore'
import type { Network } from '../features/trading/client'
import { outcomeCoin } from '../features/trading/history'
import type { OutcomePosition } from '../features/trading/positions'
import {
  fetchBookTop,
  useOpenOutcomeOrders,
  useOutcomeFills,
  useOutcomeMarks,
  useOutcomeOrderHistory,
  useOutcomePositions,
  useTestnetOutcomes,
} from '../features/trading/queries'
import type { BookTop } from '../features/trading/ticket'
import { walletErrorMessage } from '../features/wallet/eip1193'
import ClosePanel, { type Closing } from './ClosePanel'
import { OrderHistoryTable, TradeHistoryTable } from './HistoryTables'
import OpenOrdersTable, { type OpenOrderRow } from './OpenOrdersTable'
import OrderTicket from './OrderTicket'
import PositionsTable from './PositionsTable'

interface AccountPageProps {
  network: Network
  master: string | null  // the connected wallet; null when none
  onOpenSettings: () => void
}

type AccountTab = 'positions' | 'orders' | 'trades' | 'history'

// Milestone 29.1: the Active positions page, laid out like Hyperliquid's
// own: tabs (Positions, Open Orders, Trade History, Order History) with
// Side and Market filters, then one table. Testnet until mainnet
// trading (28.x).
function AccountPage({ network, master, onOpenSettings }: AccountPageProps) {
  if (master === null) {
    return (
      <section className="page-panel">
        <h2>Active positions</h2>
        <p>Connect a wallet to see your positions, open orders, trades and order history.</p>
      </section>
    )
  }
  return <AccountView key={master} network={network} master={master} onOpenSettings={onOpenSettings} />
}

interface AccountViewProps {
  network: Network
  master: string
  onOpenSettings: () => void
}

function AccountView({ network, master, onOpenSettings }: AccountViewProps) {
  const queryClient = useQueryClient()
  const outcomes = useTestnetOutcomes()
  const positions = useOutcomePositions(network, master)
  const marks = useOutcomeMarks(network)
  const openOrders = useOpenOutcomeOrders(network, master)
  const fills = useOutcomeFills(network, master)
  const orderHistory = useOutcomeOrderHistory(network, master)
  const [tab, setTab] = useState<AccountTab>('positions')
  const [side, setSide] = useState<string | null>(null)
  const [market, setMarket] = useState<number | null>(null)
  const [descending, setDescending] = useState(true)
  const [slippage, setSlippage] = useState('')  // chosen per visit; 0.05 is only suggested
  const [closing, setClosing] = useState<Closing | null>(null)

  const names = outcomes.data
  const orderRows: OpenOrderRow[] = (openOrders.data ?? []).flatMap((order) => {
    const coin = outcomeCoin(order.coin)
    return coin === null ? [] : [{ ...order, ...coin }]
  })
  const rowsByTab: Record<AccountTab, RowKey[]> = {
    positions: positions.data ?? [],
    orders: orderRows,
    trades: fills.data ?? [],
    history: orderHistory.data ?? [],
  }
  const options = filterOptions(rowsByTab[tab], names)
  const pending = { positions: positions.isPending, orders: openOrders.isPending, trades: fills.isPending, history: orderHistory.isPending }[tab]
  const failed = { positions: positions.isError, orders: openOrders.isError, trades: fills.isError, history: orderHistory.isError }[tab]

  function chooseTab(next: AccountTab) {
    setTab(next)
    setSide(null)  // each tab offers its own sides and markets
    setMarket(null)
  }

  // Books are fetched in this click handler, then held in state: the
  // confirmation shows, and Confirm signs, prices that do not move.
  async function loadBooks(targets: OutcomePosition[]) {
    try {
      const entries = await Promise.all(
        targets.map(async (position) => [position.coin, await fetchBookTop(queryClient, network, position.coin)] as [string, BookTop | null]),
      )
      setClosing((current) => current && { ...current, books: new Map(entries), fetchedAt: Date.now(), error: null })
    } catch (exc) {
      setClosing((current) => current && { ...current, error: walletErrorMessage(exc) })
    }
  }

  function openClose(targets: OutcomePosition[]) {
    setClosing({ positions: targets, books: null, fetchedAt: null, error: null })
    void loadBooks(targets)
  }

  const hasKey = readAgent(network, master) !== null
  const positionTable = sortByValue(positionRows(applyFilters(positions.data ?? [], side, market, names), marks.data), descending)
  const tabs: { value: AccountTab; label: string }[] = [
    { value: 'positions', label: `Positions (${positions.data?.length ?? 0})` },
    { value: 'orders', label: `Open Orders (${orderRows.length})` },
    { value: 'trades', label: 'Trade History' },
    { value: 'history', label: 'Order History' },
  ]
  const shown = {
    positions: positionTable.length,
    orders: applyFilters(orderRows, side, market, names).length,
    trades: applyFilters(fills.data ?? [], side, market, names).length,
    history: applyFilters(orderHistory.data ?? [], side, market, names).length,
  }[tab]

  return (
    <section className="account-page">
      {!hasKey && (
        <p className="account-key-note">
          No trading key in this tab: you can see everything, but selling or canceling needs one.{' '}
          <button type="button" onClick={onOpenSettings}>Approve one in Settings</button>
        </p>
      )}

      <div className="account-toolbar">
        <div className="account-tabs" role="tablist" aria-label="Account">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              className={tab === item.value ? 'account-tab account-tab--active' : 'account-tab'}
              onClick={() => chooseTab(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="account-filters">
          <span className="trading-key-network">{network.name}</span>
          <select aria-label="Side" value={side ?? ''} onChange={(event) => setSide(event.target.value === '' ? null : event.target.value)}>
            <option value="">Side</option>
            {options.sides.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select
            aria-label="Market"
            value={market ?? ''}
            onChange={(event) => setMarket(event.target.value === '' ? null : Number(event.target.value))}
          >
            <option value="">Market</option>
            {options.markets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>

      <div className="account-box">
        {pending ? (
          <p className="account-empty">Loading…</p>
        ) : failed ? (
          <p className="account-empty wallet-error" role="alert">Could not load this from {network.name}.</p>
        ) : shown === 0 ? (
          <p className="account-empty">
            {rowsByTab[tab].length === 0
              ? { positions: 'No open positions.', orders: 'No open orders.', trades: 'No outcome trades yet.', history: 'No outcome orders yet.' }[tab]
              : 'Nothing matches these filters.'}
          </p>
        ) : tab === 'positions' ? (
          <PositionsTable
            rows={positionTable}
            outcomes={names}
            descending={descending}
            onToggleSort={() => setDescending(!descending)}
            onSell={openClose}
          />
        ) : tab === 'orders' ? (
          <OpenOrdersTable network={network} master={master} rows={applyFilters(orderRows, side, market, names)} outcomes={names} />
        ) : tab === 'trades' ? (
          <TradeHistoryTable rows={applyFilters(fills.data ?? [], side, market, names)} outcomes={names} />
        ) : (
          <OrderHistoryTable rows={applyFilters(orderHistory.data ?? [], side, market, names)} outcomes={names} />
        )}

        {tab === 'positions' && closing !== null && (
          <ClosePanel
            key={closing.positions.map((position) => position.coin).join(',')}
            network={network}
            master={master}
            outcomes={names}
            closing={closing}
            slippage={slippage}
            onSlippage={setSlippage}
            onRefresh={() => void loadBooks(closing.positions)}
            onDone={() => setClosing(null)}
          />
        )}
      </div>

      <p className="account-footnote">
        Values use the mark price; PnL and Closed PnL are before fees. History shows Hyperliquid&apos;s most recent 2000 entries.
      </p>

      {/* Until the ticket moves to market pages (28.2), new testnet orders are placed here. */}
      <details className="account-ticket">
        <summary>Place a {network.name} order</summary>
        <OrderTicket key={`order-ticket:${master}`} network={network} master={master} />
      </details>
    </section>
  )
}

export default AccountPage
