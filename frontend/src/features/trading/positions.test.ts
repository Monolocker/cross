import { describe, expect, it } from 'vitest'
import { outcomeMids, parseOutcomePositions, positionValue } from './positions'

// Milestone 28.0b: positions from spotClearinghouseState balances ("+N"
// for the coin "#N", 26.0 probes) and mids from spotMetaAndAssetCtxs
// (outcome coins observed there in M17.5).
describe('parseOutcomePositions', () => {
  it('keeps outcome balances only, with hold, available and cost basis', () => {
    const positions = parseOutcomePositions({
      balances: [
        { coin: 'USDC', token: 0, total: '980.5', hold: '10.0', entryNtl: '0.0' },
        { coin: '+102190', token: 1, total: '42.0', hold: '2.0', entryNtl: '22.59' },
        { coin: '+102191', token: 2, total: '0.0', hold: '0.0', entryNtl: '0.0' },  // closed: left out
        { coin: '+372861', token: 3, total: '5.0', hold: '0.0' },  // no entryNtl
        { coin: '+12', total: '1.0', hold: '0.0' },  // side 2 does not exist
      ],
    })
    expect(positions).toEqual([
      { coin: '#372861', outcomeId: 37286, side: 1, total: 5, hold: 0, available: 5, entryNtl: null },
      { coin: '#102190', outcomeId: 10219, side: 0, total: 42, hold: 2, available: 40, entryNtl: 22.59 },
    ])
  })

  it('returns nothing for a malformed answer', () => {
    expect(parseOutcomePositions(undefined)).toEqual([])
    expect(parseOutcomePositions({ balances: 'x' })).toEqual([])
  })
})

describe('outcomeMids', () => {
  it('reads midPx for outcome coins, skipping missing mids and other coins', () => {
    const mids = outcomeMids([
      { universe: [] },
      [
        { coin: 'PURR/USDC', midPx: '0.2' },
        { coin: '#128770', markPx: '0.2444', midPx: '0.2559', dayNtlVlm: '10220.04' },
        { coin: '#128771', markPx: '0.5', midPx: null },
      ],
    ])
    expect([...mids]).toEqual([['#128770', 0.2559]])
    expect(outcomeMids(null).size).toBe(0)
  })
})

describe('positionValue', () => {
  const position = { coin: '#102190', outcomeId: 10219, side: 0 as const, total: 42, hold: 0, available: 42, entryNtl: 22.59 }

  it('values at the mid, PnL before the closing fee', () => {
    const value = positionValue(position, 0.6)
    expect(value.averageEntry).toBeCloseTo(0.537857, 6)
    expect(value.value).toBeCloseTo(25.2)
    expect(value.pnl).toBeCloseTo(2.61)
  })

  it('shows no value without a mid, and no PnL without a cost basis', () => {
    expect(positionValue(position, undefined)).toEqual({ averageEntry: 22.59 / 42, value: null, pnl: null })
    expect(positionValue({ ...position, entryNtl: null }, 0.6)).toMatchObject({ averageEntry: null, pnl: null })
  })
})
