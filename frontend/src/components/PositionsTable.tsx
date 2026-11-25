import { cents, dollars, outcomeName, sideLabel, type PositionRow } from '../features/trading/account'
import type { OutcomePosition } from '../features/trading/positions'
import type { TestnetOutcome } from '../features/trading/testnetMarkets'

interface PositionsTableProps {
  rows: PositionRow[]  // already filtered and sorted
  outcomes: TestnetOutcome[] | undefined
  descending: boolean
  onToggleSort: () => void
  onSell: (positions: OutcomePosition[]) => void  // opens the confirmation; nothing is sent from here
}

function pnlClass(value: number | null): string {
  return value === null || value === 0 ? '' : value > 0 ? 'history-buy' : 'history-sell'
}

// Milestone 29.1: positions in Hyperliquid's own layout. Values at the
// mark; PnL before the closing fee. Sell and Close All open a
// confirmation (ClosePanel) with the exact orders.
function PositionsTable({ rows, outcomes, descending, onToggleSort, onSell }: PositionsTableProps) {
  const sellable = rows.filter((row) => row.available > 0)
  return (
    <table className="account-table">
      <thead>
        <tr>
          <th>Market</th>
          <th className="num">Entry Price → Mark Price</th>
          <th className="num">Entry Value</th>
          <th className="num">PNL (ROE %)</th>
          <th className="num">
            <button type="button" className="account-sort" onClick={onToggleSort} aria-label="Sort by position value">
              Position Value {descending ? '↓' : '↑'}
            </button>
          </th>
          <th className="num">
            <button type="button" className="account-link" disabled={sellable.length === 0} onClick={() => onSell(sellable)}>
              Close All
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const name = outcomeName(row.outcomeId, outcomes)
          return (
            <tr key={row.coin}>
              <td>
                <div className="account-market">
                  <span className="account-icon" aria-hidden="true">{name.charAt(0)}</span>
                  <div>
                    <strong>{name}</strong>
                    <div className="account-sub">
                      <span className="account-badge">
                        {sideLabel(row, outcomes)}{row.mark !== null && ` ${cents(row.mark, true)}`}
                      </span>
                      {row.total} contracts
                      {row.hold > 0 && ` · ${row.hold} on hold for open sells`}
                    </div>
                  </div>
                </div>
              </td>
              <td className="num">
                <span className="account-muted">{row.averageEntry === null ? '—' : cents(row.averageEntry)}</span>
                {' → '}
                {row.mark === null ? '—' : cents(row.mark)}
              </td>
              <td className="num account-muted">{row.entryNtl === null ? '—' : dollars(row.entryNtl)}</td>
              <td className={`num ${pnlClass(row.pnl)}`}>
                {row.pnl === null ? '—' : dollars(row.pnl, true)}
                {row.roe !== null && ` (${row.roe < 0 ? '−' : ''}${Math.abs(row.roe * 100).toFixed(2)}%)`}
              </td>
              <td className="num">{row.value === null ? '—' : dollars(row.value)}</td>
              <td className="num">
                <button
                  type="button"
                  className="account-sell"
                  disabled={row.available <= 0}
                  title={row.available <= 0 ? 'All contracts are on hold for open sells' : undefined}
                  onClick={() => onSell([row])}
                >
                  Sell
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default PositionsTable
