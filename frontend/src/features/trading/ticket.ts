import { limitOrder, orderAction, type OrderAction } from './actions'
import type { OrderResult } from './orders'
import { outcomeAsset } from './wire'

// Order ticket rules (Milestone 27.5, minimum added in 27.7). The docs
// give no tick, lot or minimum for outcomes; these come from evidence:
//   prices:  27.1 probe, 630 live book levels, all strictly between 0
//            and 1, with at most 5 decimals (0.00001 .. 0.99999);
//   sizes:   27.1 probe, 2,134,687 fills and every book level in whole
//            contracts;
//   minimum: testnet, 2026-11-23, a 0.20 USDC order was answered "Order
//            must have minimum value of 1 USDC. asset=100102190", and
//            a 10 USDC order rested. The 27.1 mainnet probe's smallest
//            resting order was 1.18 USDC, which fits the same rule.

export type TicketTif = 'Gtc' | 'Ioc'

// Hyperliquid has no separate market order type: the official SDK's
// market_open sends "an aggressive Limit Order IoC" priced past the
// market (Milestone 28.0b). The ticket does the same.
export type OrderKind = 'limit' | 'market'

export interface TicketInput {
  outcomeId: number
  side: 0 | 1
  isBuy: boolean
  kind: OrderKind
  price: string  // limit orders only; a market order's price comes from the book
  size: string
  tif: TicketTif  // limit orders only; market orders are always IOC
}

export interface BookLevel {
  px: number
  sz: number
}

// The chosen side's book, in that side's own prices. bids and asks hold
// every level l2Book returned, best first (28.0b: a market order walks
// them to estimate its fill).
export interface BookTop {
  bestBid: BookLevel | null
  bestAsk: BookLevel | null
  bids: BookLevel[]
  asks: BookLevel[]
}

export interface Funds {
  availableUsdc: number | null  // total - hold; null while loading
  heldContracts: number | null  // contracts of the chosen side held
}

export interface TicketCheck {
  errors: string[]  // any error blocks the order
  notes: string[]  // what would happen if it were sent now
  notional: number | null  // price x size, in USDC (the worst price for a market order)
  price: string | null  // the limit price that would be signed
  action: OrderAction | null  // the exact action, only when valid
}

const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/
const WHOLE = /^[1-9]\d*$/
const MAX_PRICE_DECIMALS = 5
export const MIN_ORDER_VALUE = 1    // 1 USDC

// How far past the best price a market order may fill: 0.05, the same
// ±0.05 band decided for mainnet (28). The SDK's default is 5% of the
// mid; outcome prices are probabilities, so a fixed band is clearer.
export const MARKET_SLIPPAGE = 0.05
const PRICE_UNITS = 100_000  // 5 decimals
const MIN_PRICE_UNITS = 1  // 0.00001
const MAX_PRICE_UNITS = PRICE_UNITS - 1  // 0.99999

function priceDecimals(price: string): number {
  return (price.split('.')[1] ?? '').replace(/0+$/, '').length
}

// 47000 -> "0.47". Whole units of 0.00001, so no float drift reaches the wire.
function unitsToPrice(units: number): string {
  return `0.${String(units).padStart(5, '0')}`.replace(/0+$/, '')
}

// The limit price of a market order: the best opposite price moved by
// the slippage band, kept inside 0.00001 .. 0.99999. Null when the
// opposite side of the book is empty (nothing to fill against).
export function marketLimitPrice(book: BookTop, isBuy: boolean, slippage = MARKET_SLIPPAGE): string | null {
  const best = isBuy ? book.bestAsk : book.bestBid
  if (best === null) {
    return null
  }
  const shift = Math.round(slippage * PRICE_UNITS)
  const units = Math.round(best.px * PRICE_UNITS) + (isBuy ? shift : -shift)
  return unitsToPrice(Math.min(MAX_PRICE_UNITS, Math.max(MIN_PRICE_UNITS, units)))
}

export interface FillEstimate {
  filled: number  // contracts the book offers at or better than the limit
  averagePx: number | null  // null when nothing would fill
}

// What an IOC order would fill against the book as it is now: walk the
// opposite side, best first, up to the size and the limit price. An
// estimate only: the book can move before the order arrives.
export function estimateFill(book: BookTop, isBuy: boolean, size: number, limitPx: number): FillEstimate {
  let filled = 0
  let cost = 0
  for (const level of isBuy ? book.asks : book.bids) {
    if (filled >= size || (isBuy ? level.px > limitPx : level.px < limitPx)) {
      break
    }
    const take = Math.min(level.sz, size - filled)
    filled += take
    cost += take * level.px
  }
  return { filled, averagePx: filled > 0 ? cost / filled : null }
}

// Rounded to 5 decimals for display, without trailing zeros.
function showPx(px: number): string {
  return String(Number(px.toFixed(5)))
}

export function checkTicket(input: TicketInput, book: BookTop | null, funds: Funds): TicketCheck {
  const errors: string[] = []
  const notes: string[] = []
  const market = input.kind === 'market'

  // A market order's price is computed, so only the book can block it.
  let priceText: string | null = null
  if (market) {
    if (book === null) {
      errors.push('Waiting for the book: a market order is priced from it.')
    } else {
      priceText = marketLimitPrice(book, input.isBuy)
      if (priceText === null) {
        errors.push(input.isBuy
          ? 'No asks to buy from: a market buy cannot fill. Use a limit order to rest a bid.'
          : 'No bids to sell to: a market sell cannot fill. Use a limit order to rest an ask.')
      }
    }
  } else {
    const valid = DECIMAL.test(input.price) && Number(input.price) > 0 && Number(input.price) < 1
    if (input.price === '') {
      errors.push('Enter a price.')
    } else if (!valid) {
      errors.push('Price must be a plain decimal between 0 and 1 (e.g. 0.42).')
    } else if (priceDecimals(input.price) > MAX_PRICE_DECIMALS) {
      errors.push(`Price can have at most ${MAX_PRICE_DECIMALS} decimals.`)
    } else {
      priceText = input.price
    }
  }

  const sizeOk = WHOLE.test(input.size)
  if (input.size === '') {
    errors.push('Enter a size.')
  } else if (!sizeOk) {
    errors.push('Size is a whole number of contracts (1 or more).')
  }

  const price = Number(priceText)
  const size = Number(input.size)
  const notional = priceText !== null && sizeOk ? price * size : null

  // Checked at the limit price (the worst price for a market order): the
  // conservative reading, as it is not documented which price
  // Hyperliquid uses for an IOC. Rounded to a millionth so 0.1 x 10
  // counts as exactly 1.
  if (notional !== null && Math.round(notional * 1e6) / 1e6 < MIN_ORDER_VALUE) {
    const at = market ? ` at its worst price ${priceText}` : ''
    errors.push(`Order value must be at least ${MIN_ORDER_VALUE} USDC (Hyperliquid's minimum); this one is ${notional.toFixed(2)}${at}.`)
  }

  if (notional !== null && input.isBuy) {
    if (funds.availableUsdc === null) {
      notes.push('Your USDC balance is still loading.')
    } else if (notional > funds.availableUsdc) {
      errors.push(`This buy needs up to ${notional.toFixed(2)} USDC; ${funds.availableUsdc.toFixed(2)} is available.`)
    }
  }
  if (sizeOk && !input.isBuy) {
    // Selling more than you hold is not offered: what Hyperliquid does
    // with an uncovered outcome sell is not documented, so this ticket
    // only closes contracts you own.
    const held = funds.heldContracts ?? 0
    if (size > held) {
      errors.push(`You hold ${held} contracts of this side; this ticket only sells contracts you own.`)
    }
  }

  if (errors.length === 0 && book !== null && market && priceText !== null) {
    const best = input.isBuy ? book.bestAsk : book.bestBid
    const estimate = estimateFill(book, input.isBuy, size, price)
    notes.push(`Market ${input.isBuy ? 'buy' : 'sell'}: an IOC limit at ${priceText} `
      + `(best ${input.isBuy ? 'ask' : 'bid'} ${best?.px} ${input.isBuy ? '+' : '-'} ${MARKET_SLIPPAGE}). `
      + 'It never fills at a worse price, and never rests.')
    if (estimate.averagePx !== null) {
      notes.push(`The book now offers ${estimate.filled} of ${size} contracts by that price, `
        + `at an average of about ${showPx(estimate.averagePx)}.`)
    }
    if (estimate.filled < size) {
      notes.push(`${size - estimate.filled} contracts are not offered by ${priceText}: unless the book changes, they would be canceled.`)
    }
  } else if (errors.length === 0 && book !== null) {
    const opposite = input.isBuy ? book.bestAsk : book.bestBid
    const crosses = opposite !== null && (input.isBuy ? price >= opposite.px : price <= opposite.px)
    if (crosses && opposite !== null) {
      notes.push(`Marketable: it would fill now, starting at ${opposite.px} (${opposite.sz} contracts there).`)
      if (size > opposite.sz) {
        notes.push('More than the best level holds: the rest fills at worse prices up to your limit, or not at all.')
      }
    } else if (input.tif === 'Gtc') {
      notes.push(`It would rest on the book as a ${input.isBuy ? 'bid' : 'ask'} at ${priceText} until filled or canceled.`)
    } else {
      notes.push('IOC with nothing to fill at your price: it would be canceled immediately, with no fill.')
    }
  }

  const action = errors.length === 0 && priceText !== null
    ? orderAction([limitOrder({
        asset: outcomeAsset(input.outcomeId, input.side),
        isBuy: input.isBuy,
        price: priceText,
        size: input.size,
        tif: market ? 'Ioc' : input.tif,
      })])
    : null
  return { errors, notes, notional, price: priceText, action }
}

// What to tell the user after Send. A filled IOC can be partial: the
// response gives the size filled (e.g. "50.0" of 100), and the rest of
// an IOC order is canceled, as testnet showed on 2026-11-23.
export function describeOrderResult(result: OrderResult, requestedSize: string, networkName: string): string {
  if (result.kind === 'resting') {
    return `Resting on ${networkName}: order ${result.oid}. It stays until filled or canceled (see your open orders).`
  }
  if (result.kind === 'error') {
    return `Hyperliquid rejected the order: ${result.message}`
  }
  const filled = Number(result.totalSz)
  const requested = Number(requestedSize)
  if (filled < requested) {
    return `Filled ${filled} of ${requested} at an average of ${result.avgPx} (order ${result.oid}). `
      + `The other ${requested - filled} were canceled: IOC never rests.`
  }
  return `Filled ${filled} at an average of ${result.avgPx} (order ${result.oid}).`
}

// l2Book levels -> BookTop. levels[0] are bids (best first), levels[1] asks.
export function bookTop(book: unknown): BookTop | null {
  const levels = (book as { levels?: { px: string; sz: string }[][] } | null)?.levels
  if (!Array.isArray(levels) || levels.length < 2) {
    return null
  }
  const parse = (side: { px: string; sz: string }[]) =>
    (Array.isArray(side) ? side : []).map((level) => ({ px: Number(level.px), sz: Number(level.sz) }))
  const bids = parse(levels[0])
  const asks = parse(levels[1])
  return { bestBid: bids[0] ?? null, bestAsk: asks[0] ?? null, bids, asks }
}

// spotClearinghouseState -> available amount per coin (total - hold).
// Outcome contracts appear as "+<encoding>", e.g. "+102190".
export function availableBalances(state: unknown): Map<string, number> {
  const balances = (state as { balances?: { coin?: unknown; total?: unknown; hold?: unknown }[] } | null)?.balances
  const available = new Map<string, number>()
  for (const balance of Array.isArray(balances) ? balances : []) {
    const total = Number(balance.total)
    const hold = Number(balance.hold ?? 0)
    if (typeof balance.coin === 'string' && Number.isFinite(total) && Number.isFinite(hold)) {
      available.set(balance.coin, total - hold)
    }
  }
  return available
}
