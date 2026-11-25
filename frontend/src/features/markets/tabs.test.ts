import { describe, expect, it } from 'vitest'
import type { OutcomeMarket } from '../../types/market'
import { countByTab, filterByTab, inTab } from './tabs'

// Only the fields the tabs read; the rest of OutcomeMarket is irrelevant here.
function market(id: string, category: string | null, underlying: string | null): OutcomeMarket {
  return { id, category, underlying } as OutcomeMarket
}

const MARKETS = [
  market('1', 'sports', null),
  market('2', 'economics', null),
  market('3', 'price', 'BTC'),  // binaryPrice on the main dex
  market('4', null, 'ETH'),  // Hyperliquid's recurring markets have no category
  market('5', 'price', 'xyz:GOLD'),  // HIP-3 dex asset
  market('6', 'culture', null),  // no tab of its own
]

describe('market tabs (29.0)', () => {
  it('sorts markets into Sports, Econ, Crypto and Tradfi', () => {
    expect(filterByTab(MARKETS, 'sports').map((m) => m.id)).toEqual(['1'])
    expect(filterByTab(MARKETS, 'econ').map((m) => m.id)).toEqual(['2'])
    expect(filterByTab(MARKETS, 'crypto').map((m) => m.id)).toEqual(['3', '4'])
    expect(filterByTab(MARKETS, 'tradfi').map((m) => m.id)).toEqual(['5'])
  })

  it('keeps every market under Trending, including ones in no other tab', () => {
    expect(filterByTab(MARKETS, 'trending')).toHaveLength(6)
    expect(inTab(MARKETS[5], 'trending')).toBe(true)
    expect(['sports', 'econ', 'crypto', 'tradfi'].some((tab) => inTab(MARKETS[5], tab as never))).toBe(false)
  })

  it('counts each tab', () => {
    expect(countByTab(MARKETS)).toEqual({ trending: 6, sports: 1, crypto: 2, econ: 1, tradfi: 1 })
  })
})
