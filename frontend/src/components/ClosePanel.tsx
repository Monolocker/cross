import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { cents, dollars, outcomeName, sideLabel } from '../features/trading/account'
import { readAgent } from '../features/trading/agentStore'
import type { Network } from '../features/trading/client'
import { placeOrder } from '../features/trading/orders'
import type { OutcomePosition } from '../features/trading/positions'
import { refreshAfterTrade } from '../features/trading/queries'
import type { TestnetOutcome } from '../features/trading/testnetMarkets'
import { checkTicket, describeOrderResult, estimateFill, SUGGESTED_SLIPPAGE, type BookTop } from '../features/trading/ticket'
import { walletErrorMessage } from '../features/wallet/eip1193'

export interface Closing {
  positions: OutcomePosition[]
  books: Map<string, BookTop | null> | null  // null while loading
  fetchedAt: number | null
  error: string | null
}

interface ClosePanelProps {
  network: Network
  master: string
  outcomes: TestnetOutcome[] | undefined
  closing: Closing
  slippage: string
  onSlippage: (value: string) => void
  onRefresh: () => void
  onDone: () => void
}

// Milestone 29.1: confirm Sell / Close All. Each position becomes a
// market sell (an IOC limit at best bid - slippage, the ticket's own
// rules) of what is available. The books are fetched when this opens
// and held still until Refresh, so the orders shown are exactly the
// orders Confirm signs.
function ClosePanel({ network, master, outcomes, closing, slippage, onSlippage, onRefresh, onDone }: ClosePanelProps) {
  const queryClient = useQueryClient()
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<string[] | null>(null)

  const lines = closing.positions.map((position) => {
    const book = closing.books?.get(position.coin) ?? null
    const check = closing.books === null
      ? null
      : checkTicket(
          {
            outcomeId: position.outcomeId,
            side: position.side,
            isBuy: false,
            kind: 'market',
            price: '',
            size: String(position.available),
            tif: 'Ioc',
            slippage,
          },
          book,
          { availableUsdc: null, heldContracts: position.available },
        )
    const estimate = book !== null && check?.price != null
      ? estimateFill(book, false, position.available, Number(check.price))
      : null
    return { position, check, estimate, name: outcomeName(position.outcomeId, outcomes), side: sideLabel(position, outcomes) }
  })
  const ready = lines.filter((line) => line.check?.action != null)

  async function confirm() {
    const agent = readAgent(network, master)
    if (agent === null) {
      setResults(['Approve a trading key in Settings first. Nothing was sent.'])
      return
    }
    setSending(true)
    const messages: string[] = []
    for (const line of ready) {
      try {
        const result = await placeOrder(network, agent, line.check!.action!)
        messages.push(`${line.name} · ${line.side}: ${describeOrderResult(result, String(line.position.available), network.name)}`)
      } catch (exc) {
        messages.push(`${line.name} · ${line.side}: ${walletErrorMessage(exc)}`)
      }
    }
    setResults(messages)
    setSending(false)
    refreshAfterTrade(queryClient, network)
  }

  return (
    <div className="close-panel" role="group" aria-label="Confirm sell">
      <div className="close-panel-heading">
        <strong>{closing.positions.length === 1 ? 'Sell position' : `Close ${closing.positions.length} positions`}</strong>
        <span className="account-muted">
          {closing.fetchedAt === null ? 'Fetching books…' : `Prices as of ${new Date(closing.fetchedAt).toLocaleTimeString()}`}
        </span>
        <button type="button" className="wallet-secondary" disabled={sending || results !== null} onClick={onRefresh}>
          Refresh prices
        </button>
      </div>

      {results === null && (
        <label className="close-panel-slippage">
          Slippage (−)
          <input
            inputMode="decimal"
            value={slippage}
            placeholder={String(SUGGESTED_SLIPPAGE)}
            onChange={(event) => onSlippage(event.target.value.trim())}
          />
          {slippage !== String(SUGGESTED_SLIPPAGE) && (
            <button type="button" className="order-ticket-quote" onClick={() => onSlippage(String(SUGGESTED_SLIPPAGE))}>
              Use suggested −{SUGGESTED_SLIPPAGE}
            </button>
          )}
          <span className="account-muted">You sell at the bids; slippage only caps how far below the best bid.</span>
        </label>
      )}

      {closing.error !== null && <p className="wallet-error trading-key-error" role="alert">Could not fetch the books: {closing.error}</p>}

      {results === null ? (
        <ul className="close-panel-lines">
          {lines.map(({ position, check, estimate, name, side }) => (
            <li key={position.coin}>
              <span>
                Market sell <strong>{position.available}</strong> {side} · {name}
              </span>
              {check === null ? (
                <span className="account-muted">…</span>
              ) : check.action !== null && check.price !== null ? (
                <span>
                  no worse than <strong>{cents(Number(check.price))}</strong>
                  {estimate?.averagePx != null && ` · book now: ${estimate.filled} at about ${cents(estimate.averagePx)}`}
                  {check.notional !== null && ` · receives at least ${dollars(check.notional)} (before fees)`}
                </span>
              ) : (
                <span className="wallet-error">{check.errors.join(' ')}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="close-panel-lines" role="status">
          {results.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}

      <div className="close-panel-actions">
        {results === null ? (
          <>
            <button type="button" className="account-sell" disabled={sending || ready.length === 0} onClick={() => void confirm()}>
              {sending ? 'Sending…' : `Confirm: sell ${ready.length} on ${network.name}`}
            </button>
            <button type="button" className="wallet-secondary" disabled={sending} onClick={onDone}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={onDone}>Done</button>
        )}
      </div>
    </div>
  )
}

export default ClosePanel
