import { describe, expect, it } from 'vitest'
import { applyFilters, cents, dollars, filterOptions, positionRows, sortByValue } from './account'
import { outcomeMarks } from './positions'
import type { TestnetOutcome } from './testnetMarkets'

// Milestone 29.1: the Active positions page.
const OUTCOMES: TestnetOutcome[] = [
  { id: 10219, label: 'BTC above 58623 on Nov 25 at 9:00 PM?', detail: '', sides: ['Yes', 'No'], search: '' },
  { id: 372, label: 'Lakers vs Celtics', detail: '', sides: ['Lakers', 'Celtics'], search: '' },
]

describe('formatting', () => {
  it('shows prices in cents with 5-decimal precision', () => {
    expect(cents(0.5)).toBe('50.000¢')
    expect(cents(0.50505)).toBe('50.505¢')
    expect(cents(0.5, true)).toBe('50¢')
    expect(cents(0.505, true)).toBe('50.5¢')
  })

  it('shows USDC amounts with 5 decimals, optionally signed', () => {
    expect(dollars(1.5)).toBe('$1.50000')
    expect(dollars(0.015, true)).toBe('+$0.01500')
    expect(dollars(-0.02, true)).toBe('−$0.02000')
  })
})

describe('filters', () => {
  const rows = [
    { outcomeId: 10219, side: 0 as const, id: 'a' },
    { outcomeId: 10219, side: 1 as const, id: 'b' },
    { outcomeId: 372, side: 0 as const, id: 'c' },
  ]

  it('offers the side names and markets present', () => {
    expect(filterOptions(rows, OUTCOMES)).toEqual({
      sides: ['Lakers', 'No', 'Yes'],
      markets: [{ id: 10219, name: 'BTC above 58623 on Nov 25 at 9:00 PM?' }, { id: 372, name: 'Lakers vs Celtics' }],
    })
  })

  it('filters by side name and by market', () => {
    expect(applyFilters(rows, 'Yes', null, OUTCOMES).map((row) => row.id)).toEqual(['a'])
    expect(applyFilters(rows, null, 372, OUTCOMES).map((row) => row.id)).toEqual(['c'])
    expect(applyFilters(rows, 'No', 372, OUTCOMES)).toEqual([])
    expect(applyFilters(rows, null, null, OUTCOMES)).toHaveLength(3)
  })

  it('names unknown outcomes by id', () => {
    expect(filterOptions([{ outcomeId: 5, side: 1 }], undefined)).toEqual({ sides: ['Side 1'], markets: [{ id: 5, name: 'Outcome 5' }] })
  })
})

describe('positions table', () => {
  // The screenshot's row: 3 Yes bought at 0.50, mark 0.505.
  const position = { coin: '#102190', outcomeId: 10219, side: 0 as const, total: 3, hold: 0, available: 3, entryNtl: 1.5 }

  it('computes entry, value, PnL and ROE at the mark', () => {
    const marks = outcomeMarks([{}, [{ coin: '#102190', markPx: '0.505', midPx: '0.51' }]])
    const [row] = positionRows([position], marks)
    expect(row.mark).toBe(0.505)
    expect(row.averageEntry).toBe(0.5)
    expect(row.value).toBeCloseTo(1.515)
    expect(row.pnl).toBeCloseTo(0.015)
    expect(row.roe).toBeCloseTo(0.01)
  })

  it('leaves figures empty without a mark or cost basis', () => {
    const [row] = positionRows([{ ...position, entryNtl: null }], new Map())
    expect(row).toMatchObject({ mark: null, value: null, pnl: null, roe: null, averageEntry: null })
  })

  it('sorts by position value, unknown values last', () => {
    const rows = positionRows(
      [position, { ...position, coin: '#3720', outcomeId: 372, total: 10 }, { ...position, coin: '#3721', outcomeId: 372, side: 1 }],
      new Map([['#102190', 0.5], ['#3720', 0.4]]),
    )
    expect(sortByValue(rows, true).map((row) => row.coin)).toEqual(['#3720', '#102190', '#3721'])
    expect(sortByValue(rows, false).map((row) => row.coin)).toEqual(['#102190', '#3720', '#3721'])
  })
})
