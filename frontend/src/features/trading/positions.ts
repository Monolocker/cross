// Outcome positions (Milestone 28.0b). Holdings are spot balances in
// spotClearinghouseState (26.0 probes, also the backend's trader
// dashboard): "+N" for the coin "#N", with "total", "hold" (locked by
// open sell orders) and "entryNtl" (the USDC paid for them).

export interface OutcomePosition {
  coin: string  // "#102190"
  outcomeId: number  // 10219
  side: 0 | 1
  total: number  // contracts held
  hold: number  // contracts locked by open sells
  available: number  // total - hold: what a sell can use now
  entryNtl: number | null  // USDC cost basis; null if missing
}

const OUTCOME_BALANCE = /^\+(\d+)$/

export function parseOutcomePositions(state: unknown): OutcomePosition[] {
  const balances = (state as { balances?: { coin?: unknown; total?: unknown; hold?: unknown; entryNtl?: unknown }[] } | null)?.balances
  const positions: OutcomePosition[] = []
  for (const balance of Array.isArray(balances) ? balances : []) {
    const match = typeof balance.coin === 'string' ? OUTCOME_BALANCE.exec(balance.coin) : null
    const total = Number(balance.total)
    const hold = Number(balance.hold ?? 0)
    if (match === null || !Number.isFinite(total) || total <= 0 || !Number.isFinite(hold)) {
      continue
    }
    const encoding = Number(match[1])
    if (encoding % 10 > 1) {
      continue  // not a side 0 / side 1 encoding
    }
    const entryNtl = balance.entryNtl === undefined ? NaN : Number(balance.entryNtl)
    positions.push({
      coin: `#${encoding}`,
      outcomeId: Math.floor(encoding / 10),
      side: (encoding % 10) as 0 | 1,
      total,
      hold,
      available: total - hold,
      entryNtl: Number.isFinite(entryNtl) ? entryNtl : null,
    })
  }
  return positions.sort((a, b) => b.outcomeId - a.outcomeId || a.side - b.side)
}

// spotMetaAndAssetCtxs -> one price field per outcome coin. Outcome
// coins appear there with "midPx" and "markPx" (M17.5 observation). A
// null or missing price is left out, so no value is shown rather than a
// guess.
function contextPrices(response: unknown, field: 'midPx' | 'markPx'): Map<string, number> {
  const contexts = Array.isArray(response) ? (response[1] as Record<string, unknown>[]) : null
  const prices = new Map<string, number>()
  for (const context of Array.isArray(contexts) ? contexts : []) {
    const raw = context[field]
    if (typeof context.coin !== 'string' || !/^#\d+$/.test(context.coin) || raw === null || raw === undefined) {
      continue
    }
    const price = Number(raw)
    if (Number.isFinite(price)) {
      prices.set(context.coin, price)
    }
  }
  return prices
}

// midPx is null when a side has no two-sided book.
export function outcomeMids(response: unknown): Map<string, number> {
  return contextPrices(response, 'midPx')
}

// markPx: the Active positions page values positions at the mark, as
// Hyperliquid's own positions table does (29.1).
export function outcomeMarks(response: unknown): Map<string, number> {
  return contextPrices(response, 'markPx')
}

export interface PositionValue {
  averageEntry: number | null  // entryNtl / total
  value: number | null  // total x price (the mark on the Active positions page)
  pnl: number | null  // value - entryNtl, before the closing fee
}

export function positionValue(position: OutcomePosition, price: number | undefined): PositionValue {
  const averageEntry = position.entryNtl === null ? null : position.entryNtl / position.total
  const value = price === undefined ? null : position.total * price
  const pnl = value === null || position.entryNtl === null ? null : value - position.entryNtl
  return { averageEntry, value, pnl }
}
