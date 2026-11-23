import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { OrderAction } from '../features/trading/actions'
import { readAgent } from '../features/trading/agentStore'
import type { Network } from '../features/trading/client'
import { placeOrder } from '../features/trading/orders'
import { refreshAfterTrade, useAvailableBalances, useBookTop, useOutcomeVolumes, useTestnetOutcomes } from '../features/trading/queries'
import { searchOutcomes, trendingOutcomes } from '../features/trading/testnetMarkets'
import { checkTicket, describeOrderResult, type TicketTif } from '../features/trading/ticket'
import { walletErrorMessage } from '../features/wallet/eip1193'
import OpenOrders from './OpenOrders'

interface OrderTicketProps {
  network: Network
  master: string
}

// Milestone 27.5/27.6: the testnet order ticket. It reads testnet
// markets and balances straight from Hyperliquid, checks the order and
// shows the exact action. Review, then Send: the trading key signs THAT
// action and it goes to testnet. Testnet funds have no value.
function OrderTicket({ network, master }: OrderTicketProps) {
  const queryClient = useQueryClient()
  const outcomes = useTestnetOutcomes()
  const volumes = useOutcomeVolumes(network)
  const balances = useAvailableBalances(network, master)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)  // the search box has focus
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [side, setSide] = useState<0 | 1>(0)
  const [isBuy, setIsBuy] = useState(true)
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [tif, setTif] = useState<TicketTif>('Gtc')
  const [reviewed, setReviewed] = useState<OrderAction | null>(null)  // what Send will sign
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const selected = outcomes.data?.find((outcome) => outcome.id === selectedId) ?? null
  const encoding = selected === null ? null : 10 * selected.id + side
  const book = useBookTop(network, encoding === null ? null : `#${encoding}`)
  // Typing searches; an empty, focused box shows the busiest outcomes.
  const trending = query.trim() === ''
  const matches = useMemo(() => {
    if (outcomes.data === undefined) {
      return []
    }
    if (!trending) {
      return searchOutcomes(outcomes.data, query)
    }
    return volumes.data === undefined ? [] : trendingOutcomes(outcomes.data, volumes.data)
  }, [outcomes.data, volumes.data, query, trending])
  const showList = searching && matches.length > 0

  const availableUsdc = balances.data?.get('USDC') ?? (balances.data === undefined ? null : 0)
  const heldContracts = encoding === null || balances.data === undefined ? null : balances.data.get(`+${encoding}`) ?? 0
  const check = selected === null
    ? null
    : checkTicket(
        { outcomeId: selected.id, side, isBuy, price, size, tif },
        book.data ?? null,
        { availableUsdc, heldContracts },
      )

  // The confirmation shows only while the inputs still build exactly the
  // reviewed action, so what you confirm is what is signed.
  const confirming = reviewed !== null && check !== null && check.action !== null
    && JSON.stringify(reviewed) === JSON.stringify(check.action)

  async function send() {
    if (reviewed === null) {
      return
    }
    const agent = readAgent(network, master)
    if (agent === null) {
      setSendError('Approve a trading key above first.')
      return
    }
    setSending(true)
    setSendResult(null)
    setSendError(null)
    try {
        const requested = reviewed.orders[0].s
        const result = await placeOrder(network, agent, reviewed)
        setSendResult(describeOrderResult(result, requested, network.name))
        setReviewed(null)
        if (result.kind !== 'error') {
          setSize('')  // a stale size would raise errors against the new balance
        }
      } catch (exc) {
      setSendError(walletErrorMessage(exc))
    } finally {
      setSending(false)
      refreshAfterTrade(queryClient, network)
    }
  }

  function choose(id: number) {
    setSelectedId(id)
    setQuery('')
    setSearching(false)
    setSide(0)
    setPrice('')
  }

  function volumeLabel(id: number): string {
    const volume = volumes.data?.get(id)
    return volume === undefined ? '' : ` · 24h ${volume.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`
  }

  return (
    <section className="order-ticket" aria-label="Order ticket">
      <div className="trading-key-heading">
        <strong>Order ticket</strong>
        <span className="trading-key-network">{network.name}</span>
        <span className="order-ticket-dry">Orders are real on {network.name}, with test funds</span>
      </div>

      <input
        type="search"
        className="order-ticket-search"
        placeholder={outcomes.isPending ? 'Loading testnet outcomes…' : 'Search testnet outcomes'}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setSearching(true)
        }}
        onFocus={() => setSearching(true)}
        onClick={() => setSearching(true)}
        onBlur={() => setSearching(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setSearching(false)
          }
        }}
      />
      {outcomes.isError && (
        <p className="wallet-error trading-key-error" role="alert">
          Could not load testnet outcomes from the backend: {outcomes.error.message}
        </p>
      )}
      {searching && trending && volumes.isSuccess && matches.length === 0 && (
        <p className="order-ticket-dry">
          {volumes.data.size === 0
            ? `${network.name} reported no 24h volumes for outcomes. Type to search.`
            : `No ${network.name} outcome has traded in the last 24 hours. Type to search.`}
        </p>
      )}
      {showList && (
        // preventDefault keeps focus in the search box, so a click on a
        // result lands before the box's blur hides the list.
        <div className="order-ticket-results" onMouseDown={(event) => event.preventDefault()}>
          {trending && <p className="order-ticket-results-heading">Trending on {network.name} (24h volume)</p>}
          <ul>
            {matches.map((outcome) => (
              <li key={outcome.id}>
                <button type="button" onClick={() => choose(outcome.id)}>
                  <span>{outcome.label}</span>
                  <small>#{outcome.id}{outcome.detail !== '' && ` · ${outcome.detail}`}{volumeLabel(outcome.id)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected !== null && check !== null && (
        <div className="order-ticket-form">
          <p className="order-ticket-market">
          <strong>{selected.label}</strong>{' '}
          <small>outcome {selected.id}{selected.detail !== '' && ` · ${selected.detail}`}</small>
          </p>

          <div className="order-ticket-row" role="group" aria-label="Side">
            {selected.sides.map((name, index) => (
              <button
                key={name + index}
                type="button"
                aria-pressed={side === index}
                onClick={() => setSide(index as 0 | 1)}
              >
                {name}
              </button>
            ))}
            <span className="order-ticket-gap" />
            <button type="button" aria-pressed={isBuy} onClick={() => setIsBuy(true)}>Buy</button>
            <button type="button" aria-pressed={!isBuy} onClick={() => setIsBuy(false)}>Sell</button>
          </div>

          <p className="order-ticket-book">
            {selected.sides[side]} book:{' '}
            {book.data?.bestBid ? (
              <button type="button" className="order-ticket-quote" onClick={() => setPrice(String(book.data?.bestBid?.px))}>
                bid {book.data.bestBid.px} × {book.data.bestBid.sz}
              </button>
            ) : 'no bids'}
            {' · '}
            {book.data?.bestAsk ? (
              <button type="button" className="order-ticket-quote" onClick={() => setPrice(String(book.data?.bestAsk?.px))}>
                ask {book.data.bestAsk.px} × {book.data.bestAsk.sz}
              </button>
            ) : 'no asks'}
          </p>

          <div className="order-ticket-row">
            <label>
              Price
              <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value.trim())} placeholder="0.42" />
            </label>
            <label>
              Contracts
              <input inputMode="numeric" value={size} onChange={(event) => setSize(event.target.value.trim())} placeholder="1" />
            </label>
            <label>
              Time in force
              <select value={tif} onChange={(event) => setTif(event.target.value as TicketTif)}>
                <option value="Gtc">GTC: rest until filled or canceled</option>
                <option value="Ioc">IOC: fill now or cancel</option>
              </select>
            </label>
          </div>

          <p className="order-ticket-funds">
            Available: {availableUsdc === null ? '…' : `${availableUsdc.toFixed(2)} USDC`} · You hold{' '}
            {heldContracts === null ? '…' : heldContracts} {selected.sides[side]} contracts
            {check.notional !== null && ` · Order value ${check.notional.toFixed(2)} USDC`}
          </p>

          {check.errors.length > 0 && (
            <ul className="order-ticket-errors" role="alert">
              {check.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
          {check.notes.length > 0 && (
            <ul className="order-ticket-notes">
              {check.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
          {check.action !== null && (
            <details className="order-ticket-preview" open>
              <summary>Exact action the trading key would sign (POST {network.apiUrl}/exchange)</summary>
              <pre>{JSON.stringify(check.action, null, 2)}</pre>
            </details>
          )}

          {check.action !== null && !confirming && (
            <button type="button" disabled={sending} onClick={() => setReviewed(check.action)}>
              Review order
            </button>
          )}
          {confirming && (
            <div className="order-ticket-confirm" role="group" aria-label="Confirm order">
              <p>
                {isBuy ? 'Buy' : 'Sell'} <strong>{size}</strong> {selected.sides[side]} at <strong>{price}</strong>{' '}
                ({tif === 'Gtc' ? 'GTC' : 'IOC'}) on <strong>{selected.label}</strong>, {network.name}.
                {check.notional !== null && ` Order value ${check.notional.toFixed(2)} USDC.`}
              </p>
              <button type="button" disabled={sending} onClick={() => void send()}>
                {sending ? 'Sending…' : `Send to ${network.name}`}
              </button>
              <button type="button" className="wallet-secondary" disabled={sending} onClick={() => setReviewed(null)}>
                Back
              </button>
            </div>
          )}
          {sendResult !== null && <p className="trading-key-message" role="status">{sendResult}</p>}
          {sendError !== null && <p className="wallet-error trading-key-error" role="alert">{sendError}</p>}
        </div>
      )}

      <OpenOrders network={network} master={master} outcomes={outcomes.data} />
    </section>
  )
}

export default OrderTicket