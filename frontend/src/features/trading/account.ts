import { positionValue, type OutcomePosition } from './positions'
import type { TestnetOutcome } from './testnetMarkets'

// Helpers for the Active positions page (Milestone 29.1): names, the
// Side and Market filters, and the positions table's figures.

export interface RowKey {
  outcomeId: number
  side: 0 | 1
}

export function outcomeName(outcomeId: number, outcomes: TestnetOutcome[] | undefined): string {
  return outcomes?.find((item) => item.id === outcomeId)?.label ?? `Outcome ${outcomeId}`
}

export function sideLabel(row: RowKey, outcomes: TestnetOutcome[] | undefined): string {
  return outcomes?.find((item) => item.id === row.outcomeId)?.sides[row.side] ?? `Side ${row.side}`
}

export interface FilterOptions {
  sides: string[]  // side names present, e.g. ["Yes", "No"]
  markets: { id: number; name: string }[]
}

// The dropdowns offer only what the current tab's rows contain.
export function filterOptions(rows: RowKey[], outcomes: TestnetOutcome[] | undefined): FilterOptions {
  const sides = [...new Set(rows.map((row) => sideLabel(row, outcomes)))].sort()
  const ids = [...new Set(rows.map((row) => row.outcomeId))]
  const markets = ids
    .map((id) => ({ id, name: outcomeName(id, outcomes) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { sides, markets }
}

export function applyFilters<T extends RowKey>(
  rows: T[],
  side: string | null,
  market: number | null,
  outcomes: TestnetOutcome[] | undefined,
): T[] {
  return rows.filter((row) =>
    (side === null || sideLabel(row, outcomes) === side) && (market === null || row.outcomeId === market))
}

// 0.505 -> "50.500¢": 5 decimals of a dollar, the precision of outcome
// prices. trim drops trailing zeros for short labels ("50.5¢").
export function cents(price: number, trim = false): string {
  const fixed = (price * 100).toFixed(3)
  return `${trim ? String(Number(fixed)) : fixed}¢`
}

// 1.5 -> "$1.50000"; signed: "+$0.02000" / "−$0.02000".
export function dollars(value: number, signed = false): string {
  const sign = signed ? (value >= 0 ? '+' : '−') : value < 0 ? '−' : ''
  return `${sign}$${Math.abs(value).toFixed(5)}`
}

export interface PositionRow extends OutcomePosition {
  mark: number | null
  averageEntry: number | null
  value: number | null  // total x mark
  pnl: number | null  // before the closing fee
  roe: number | null  // pnl / entryNtl, as a fraction
}

export function positionRows(positions: OutcomePosition[], marks: Map<string, number> | undefined): PositionRow[] {
  return positions.map((position) => {
    const mark = marks?.get(position.coin)
    const { averageEntry, value, pnl } = positionValue(position, mark)
    const roe = pnl === null || position.entryNtl === null || position.entryNtl === 0 ? null : pnl / position.entryNtl
    return { ...position, mark: mark ?? null, averageEntry, value, pnl, roe }
  })
}

// Position Value, largest first by default; unknown values go last
// either way.
export function sortByValue(rows: PositionRow[], descending: boolean): PositionRow[] {
  return [...rows].sort((a, b) => {
    if (a.value === null || b.value === null) {
      return a.value === null ? (b.value === null ? 0 : 1) : -1
    }
    return descending ? b.value - a.value : a.value - b.value
  })
}
