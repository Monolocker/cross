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

// spotMetaAndAssetCtxs -> mid price per outcome coin. Outcome coins appear
// there with "midPx" (M17.5 observation); midPx is null when a side has
// no two-sided book, and then no value is shown rather than a guess.
export function outcomeMids(response: unknown): Map<string, number> {
  const contexts = Array.isArray(response) ? (response[1] as { coin?: unknown; midPx?: unknown }[]) : null
  const mids = new Map<string, number>()
  for (const context of Array.isArray(contexts) ? contexts : []) {
    if (typeof context.coin !== 'string' || !/^#\d+$/.test(context.coin) || context.midPx === null || context.midPx === undefined) {
      continue
    }
    const mid = Number(context.midPx)
    if (Number.isFinite(mid)) {
      mids.set(context.coin, mid)
    }
  }
  return mids
}

export interface PositionValue {
  averageEntry: number | null  // entryNtl / total
  value: number | null  // total x mid
  pnl: number | null  // value - entryNtl, before the closing fee
}

export function positionValue(position: OutcomePosition, mid: number | undefined): PositionValue {
  const averageEntry = position.entryNtl === null ? null : position.entryNtl / position.total
  const value = mid === undefined ? null : position.total * mid
  const pnl = value === null || position.entryNtl === null ? null : value - position.entryNtl
  return { averageEntry, value, pnl }
}
