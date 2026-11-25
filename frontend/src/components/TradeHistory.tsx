import { useState } from 'react'
import type { Network } from '../features/trading/client'
import type { OutcomeCoin } from '../features/trading/history'
import { useOutcomeFills, useOutcomeOrderHistory } from '../features/trading/queries'
import type { TestnetOutcome } from '../features/trading/testnetMarkets'

interface HistoryProps {
  network: Network
  master: string
  outcomes: TestnetOutcome[] | undefined  // for names; coins are shown regardless
}

const PAGE = 50

function marketName(coin: OutcomeCoin, outcomes: TestnetOutcome[] | undefined): string {
  const outcome = outcomes?.find((item) => item.id === coin.outcomeId)
  return outcome === undefined ? coin.coin : `${outcome.label} · ${outcome.sides[coin.side]}`
}

function when(ms: number): string {
  return new Date(ms).toLocaleString()
}

// Milestone 29.0: your outcome fills, newest first (Hyperliquid returns
// at most the 2000 most recent). Prices and sizes are shown exactly as
// Hyperliquid reports them.
export function TradeHistory({ network, master, outcomes }: HistoryProps) {
  const fills = useOutcomeFills(network, master)
  const [all, setAll] = useState(false)
  const rows = all ? fills.data ?? [] : (fills.data ?? []).slice(0, PAGE)

  return (
    <div className="history-section">
      <strong>Trade history</strong>
      {fills.isPending && <p className="order-ticket-dry">Loading…</p>}
      {fills.isError && <p className="wallet-error trading-key-error" role="alert">Could not load trade history.</p>}
      {fills.data?.length === 0 && <p className="order-ticket-dry">No outcome trades yet.</p>}
      {rows.length > 0 && (
        <div className="history-table">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Direction</th>
                <th>Price</th>
                <th>Contracts</th>
                <th>Value</th>
                <th>Fee</th>
                <th>Closed PnL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fill) => (
                <tr key={`${fill.tid ?? fill.oid}-${fill.time}`}>
                  <td>{when(fill.time)}</td>
                  <td>{marketName(fill, outcomes)}</td>
                  <td className={fill.isBuy ? 'history-buy' : 'history-sell'}>
                    {fill.dir || (fill.isBuy ? 'Buy' : 'Sell')}{fill.crossed === true ? ' (taker)' : ''}
                  </td>
                  <td>{fill.px}</td>
                  <td>{Number(fill.sz)}</td>
                  <td>{(Number(fill.px) * Number(fill.sz)).toFixed(5)}</td>
                  <td>{fill.fee} {fill.feeToken}</td>
                  <td>{fill.closedPnl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(fills.data?.length ?? 0) > PAGE && (
        <button type="button" className="wallet-secondary" onClick={() => setAll(!all)}>
          {all ? `Show the latest ${PAGE}` : `Show all ${fills.data?.length}`}
        </button>
      )}
      <p className="order-ticket-dry">Closed PnL is before fees, as Hyperliquid reports it.</p>
    </div>
  )
}

// Milestone 29.0: every outcome order and how it ended (filled,
// canceled, rejected, still open), newest first; at most the 2000 most
// recent.
export function OrderHistory({ network, master, outcomes }: HistoryProps) {
  const orders = useOutcomeOrderHistory(network, master)
  const [all, setAll] = useState(false)
  const rows = all ? orders.data ?? [] : (orders.data ?? []).slice(0, PAGE)

  return (
    <div className="history-section">
      <strong>Order history</strong>
      {orders.isPending && <p className="order-ticket-dry">Loading…</p>}
      {orders.isError && <p className="wallet-error trading-key-error" role="alert">Could not load order history.</p>}
      {orders.data?.length === 0 && <p className="order-ticket-dry">No outcome orders yet.</p>}
      {rows.length > 0 && (
        <div className="history-table">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Side</th>
                <th>Type</th>
                <th>Limit</th>
                <th>Filled / size</th>
                <th>Status</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={`${order.oid}-${order.time}`}>
                  <td>{when(order.time)}</td>
                  <td>{marketName(order, outcomes)}</td>
                  <td className={order.isBuy ? 'history-buy' : 'history-sell'}>{order.isBuy ? 'Buy' : 'Sell'}</td>
                  <td>{order.orderType}{order.tif === null ? '' : ` ${order.tif}`}</td>
                  <td>{order.limitPx}</td>
                  <td>{Number(order.origSz) - Number(order.remainingSz)} / {Number(order.origSz)}</td>
                  <td>{order.status}</td>
                  <td><small>{order.oid}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(orders.data?.length ?? 0) > PAGE && (
        <button type="button" className="wallet-secondary" onClick={() => setAll(!all)}>
          {all ? `Show the latest ${PAGE}` : `Show all ${orders.data?.length}`}
        </button>
      )}
    </div>
  )
}
