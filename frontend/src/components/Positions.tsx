import type { Network } from '../features/trading/client'
import { positionValue, type OutcomePosition } from '../features/trading/positions'
import { useOutcomeMids, useOutcomePositions } from '../features/trading/queries'
import type { TestnetOutcome } from '../features/trading/testnetMarkets'

interface PositionsProps {
  network: Network
  master: string
  outcomes: TestnetOutcome[] | undefined  // for names; positions show regardless
  onClose: (position: OutcomePosition) => void  // fills the ticket; nothing is sent from here
}

// Position figures in 5 decimals, the precision of outcome prices (28.0c).
function px(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(5)
}

function usdc(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(5)} USDC`
}

function signedUsdc(value: number | null): string {
  return value === null ? '—' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(5)} USDC`
}

// Milestone 28.0b: the outcome contracts you hold on testnet. "Close"
// only fills the ticket with a market sell of what is available; the
// order is still reviewed and sent from the ticket.
function Positions({ network, master, outcomes, onClose }: PositionsProps) {
  const positions = useOutcomePositions(network, master)
  const mids = useOutcomeMids(network)

  if (positions.isPending) {
    return null
  }
  return (
    <div className="open-orders">
      <strong>Your {network.name} positions</strong>
      {positions.isError && <p className="wallet-error trading-key-error" role="alert">Could not load positions.</p>}
      {positions.data?.length === 0 && <p className="order-ticket-dry">None.</p>}
      {positions.data !== undefined && positions.data.length > 0 && (
        <ul>
          {positions.data.map((position) => {
            const outcome = outcomes?.find((item) => item.id === position.outcomeId)
            const mid = mids.data?.get(position.coin)
            const { averageEntry, value, pnl } = positionValue(position, mid)
            const closable = outcome !== undefined && position.available > 0
            return (
              <li key={position.coin}>
                <span>
                  {position.total} {outcome === undefined ? position.coin : `${outcome.sides[position.side]} · ${outcome.label}`}
                  {position.hold > 0 && ` (${position.hold} on hold for open sells)`}
                  {' · '}avg {px(averageEntry)}
                  {' · '}mid {px(mid)}
                  {' · '}value {usdc(value)}
                  {' · '}PnL {signedUsdc(pnl)}{' '}
                  <small>{position.coin}</small>
                </span>
                <button
                  type="button"
                  disabled={!closable}
                  title={outcome === undefined ? 'Not in the live testnet market list' : undefined}
                  onClick={() => onClose(position)}
                >
                  Close
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="order-ticket-dry">
        Value and PnL use the mid price, before the closing fee; a market close fills at the bids.
      </p>
    </div>
  )
}

export default Positions
