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

export interface TicketInput {
  outcomeId: number
  side: 0 | 1
  isBuy: boolean
  price: string
  size: string
  tif: TicketTif
}

// Top of the chosen side's book, in that side's own prices.
export interface BookTop {
  bestBid: { px: number; sz: number } | null
  bestAsk: { px: number; sz: number } | null
}

export interface Funds {
  availableUsdc: number | null  // total - hold; null while loading
  heldContracts: number | null  // contracts of the chosen side held
}

export interface TicketCheck {
  errors: string[]  // any error blocks the order
  notes: string[]  // what would happen if it were sent now
  notional: number | null  // price x size, in USDC
  action: OrderAction | null  // the exact action, only when valid
}

const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/
const WHOLE = /^[1-9]\d*$/
const MAX_PRICE_DECIMALS = 5
export const MIN_ORDER_VALUE = 1    // 1 USDC 

function priceDecimals(price: string): number {
  return (price.split('.')[1] ?? '').replace(/0+$/, '').length
}

export function checkTicket(input: TicketInput, book: BookTop | null, funds: Funds): TicketCheck {
  const errors: string[] = []
  const notes: string[] = []

  const priceOk = DECIMAL.test(input.price) && Number(input.price) > 0 && Number(input.price) < 1
  if (input.price === '') {
    errors.push('Enter a price.')
  } else if (!priceOk) {
    errors.push('Price must be a plain decimal between 0 and 1 (e.g. 0.42).')
  } else if (priceDecimals(input.price) > MAX_PRICE_DECIMALS) {
    errors.push(`Price can have at most ${MAX_PRICE_DECIMALS} decimals.`)
  }

  const sizeOk = WHOLE.test(input.size)
  if (input.size === '') {
    errors.push('Enter a size.')
  } else if (!sizeOk) {
    errors.push('Size is a whole number of contracts (1 or more).')
  }

  const price = Number(input.price)
  const size = Number(input.size)
  const notional = priceOk && sizeOk ? price * size : null

  // Rounded to a millionth so 0.1 x 10 counts as exactly 1.
  if (notional !== null && Math.round(notional * 1e6) / 1e6 < MIN_ORDER_VALUE) {
    errors.push(`Order value must be at least ${MIN_ORDER_VALUE} USDC (Hyperliquid's minimum); this one is ${notional.toFixed(2)}.`)
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

  if (errors.length === 0 && book !== null) {
    const opposite = input.isBuy ? book.bestAsk : book.bestBid
    const crosses = opposite !== null && (input.isBuy ? price >= opposite.px : price <= opposite.px)
    if (crosses && opposite !== null) {
      notes.push(`Marketable: it would fill now, starting at ${opposite.px} (${opposite.sz} contracts there).`)
      if (size > opposite.sz) {
        notes.push('More than the best level holds: the rest fills at worse prices up to your limit, or not at all.')
      }
    } else if (input.tif === 'Gtc') {
      notes.push(`It would rest on the book as a ${input.isBuy ? 'bid' : 'ask'} at ${input.price} until filled or canceled.`)
    } else {
      notes.push('IOC with nothing to fill at your price: it would be canceled immediately, with no fill.')
    }
  }

  const action = errors.length === 0
    ? orderAction([limitOrder({
        asset: outcomeAsset(input.outcomeId, input.side),
        isBuy: input.isBuy,
        price: input.price,
        size: input.size,
        tif: input.tif,
      })])
    : null
  return { errors, notes, notional, action }
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

// l2Book levels -> BookTop. levels[0] are bids (best first), levels[1] asks.
export function bookTop(book: unknown): BookTop | null {
  const levels = (book as { levels?: { px: string; sz: string }[][] } | null)?.levels
  if (!Array.isArray(levels) || levels.length < 2) {
    return null
  }
  const top = (side: { px: string; sz: string }[]) =>
    side.length > 0 ? { px: Number(side[0].px), sz: Number(side[0].sz) } : null
  return { bestBid: top(levels[0]), bestAsk: top(levels[1]) }
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