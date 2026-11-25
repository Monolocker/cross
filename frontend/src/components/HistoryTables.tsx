import { cents, dollars, outcomeName, sideLabel } from '../features/trading/account'
import type { OutcomeFill, OutcomeOrderRecord } from '../features/trading/history'
import type { TestnetOutcome } from '../features/trading/testnetMarkets'

interface TableProps<T> {
  rows: T[]  // already filtered, newest first
  outcomes: TestnetOutcome[] | undefined
}

function when(ms: number): string {
  return new Date(ms).toLocaleString()
}

// Milestone 29.1: your outcome fills (Hyperliquid returns at most the
// 2000 most recent). Closed PnL is before fees, as Hyperliquid reports it.
export function TradeHistoryTable({ rows, outcomes }: TableProps<OutcomeFill>) {
  return (
    <table className="account-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Market</th>
          <th>Direction</th>
          <th className="num">Price</th>
          <th className="num">Contracts</th>
          <th className="num">Value</th>
          <th className="num">Fee</th>
          <th className="num">Closed PnL</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((fill) => (
          <tr key={`${fill.tid ?? fill.oid}-${fill.time}`}>
            <td className="account-muted">{when(fill.time)}</td>
            <td><strong>{outcomeName(fill.outcomeId, outcomes)}</strong></td>
            <td className={fill.isBuy ? 'history-buy' : 'history-sell'}>
              {fill.dir || (fill.isBuy ? 'Buy' : 'Sell')} {sideLabel(fill, outcomes)}{fill.crossed === true ? ' (taker)' : ''}
            </td>
            <td className="num">{cents(Number(fill.px))}</td>
            <td className="num">{Number(fill.sz)}</td>
            <td className="num">{dollars(Number(fill.px) * Number(fill.sz))}</td>
            <td className="num">{fill.fee} {fill.feeToken}</td>
            <td className="num">{fill.closedPnl}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Milestone 29.1: every outcome order and how it ended, newest first; at
// most the 2000 most recent.
export function OrderHistoryTable({ rows, outcomes }: TableProps<OutcomeOrderRecord>) {
  return (
    <table className="account-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Market</th>
          <th>Side</th>
          <th>Type</th>
          <th className="num">Limit</th>
          <th className="num">Filled / Size</th>
          <th>Status</th>
          <th className="num">Order</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((order) => (
          <tr key={`${order.oid}-${order.time}`}>
            <td className="account-muted">{when(order.time)}</td>
            <td><strong>{outcomeName(order.outcomeId, outcomes)}</strong></td>
            <td className={order.isBuy ? 'history-buy' : 'history-sell'}>
              {order.isBuy ? 'Buy' : 'Sell'} {sideLabel(order, outcomes)}
            </td>
            <td>{order.orderType}{order.tif === null ? '' : ` ${order.tif}`}</td>
            <td className="num">{cents(Number(order.limitPx))}</td>
            <td className="num">{Number(order.origSz) - Number(order.remainingSz)} / {Number(order.origSz)}</td>
            <td>{order.status}</td>
            <td className="num account-muted">{order.oid}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
