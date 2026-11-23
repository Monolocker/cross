import { useMemo, useState } from 'react'
import type { Network } from '../features/trading/client'
import { useAvailableBalances, useBookTop, useOutcomeList } from '../features/trading/queries'
import { searchOutcomes } from '../features/trading/testnetMarkets'
import { checkTicket, type TicketTif } from '../features/trading/ticket'

interface OrderTicketProps {
  network: Network
  master: string
}

// Milestone 27.5: a DRY-RUN order ticket on testnet. It reads testnet
// markets and your testnet balances straight from Hyperliquid, checks
// the order and shows the exact action that would be signed. Nothing is
// signed or sent; 27.6 adds that.
function OrderTicket({ network, master }: OrderTicketProps) {
  const outcomes = useOutcomeList(network)
  const balances = useAvailableBalances(network, master)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [side, setSide] = useState<0 | 1>(0)
  const [isBuy, setIsBuy] = useState(true)
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [tif, setTif] = useState<TicketTif>('Gtc')

  const selected = outcomes.data?.find((outcome) => outcome.id === selectedId) ?? null
  const encoding = selected === null ? null : 10 * selected.id + side
  const book = useBookTop(network, encoding === null ? null : `#${encoding}`)
  const matches = useMemo(
    () => (query.trim() === '' || outcomes.data === undefined ? [] : searchOutcomes(outcomes.data, query)),
    [outcomes.data, query],
  )

  const availableUsdc = balances.data?.get('USDC') ?? (balances.data === undefined ? null : 0)
  const heldContracts = encoding === null || balances.data === undefined ? null : balances.data.get(`+${encoding}`) ?? 0
  const check = selected === null
    ? null
    : checkTicket(
        { outcomeId: selected.id, side, isBuy, price, size, tif },
        book.data ?? null,
        { availableUsdc, heldContracts },
      )

  function choose(id: number) {
    setSelectedId(id)
    setQuery('')
    setSide(0)
    setPrice('')
  }

  return (
    <section className="order-ticket" aria-label="Order ticket">
      <div className="trading-key-heading">
        <strong>Order ticket</strong>
        <span className="trading-key-network">{network.name}</span>
        <span className="order-ticket-dry">Dry run: nothing is signed or sent</span>
      </div>

      <input
        type="search"
        className="order-ticket-search"
        placeholder={outcomes.isPending ? 'Loading testnet outcomes…' : 'Search testnet outcomes (e.g. France, BTC, 102190)'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {outcomes.isError && <p className="wallet-error trading-key-error" role="alert">Could not load testnet outcomes.</p>}
      {matches.length > 0 && (
        <ul className="order-ticket-results">
          {matches.map((outcome) => (
            <li key={outcome.id}>
              <button type="button" onClick={() => choose(outcome.id)}>
                <span>{outcome.label}</span>
                <small>#{outcome.id} · {outcome.detail}</small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected !== null && check !== null && (
        <div className="order-ticket-form">
          <p className="order-ticket-market">
            <strong>{selected.label}</strong> <small>outcome {selected.id} · {selected.detail}</small>
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
        </div>
      )}
    </section>
  )
}

export default OrderTicket