import type { OutcomeMarket } from '../../types/market'

// The landing page's market tabs (Milestone 29.0). Trending is every
// market by 24h volume; the others are filters:
//   Sports, Econ: Hyperliquid's own template category ("sports",
//                 "economics").
//   Crypto, Tradfi: price markets, told apart by their asset. An asset
//                 on Hyperliquid's main perp dex ("BTC") counts as
//                 crypto; one on a HIP-3 dex keeps its dex prefix
//                 ("xyz:GOLD") and counts as tradfi.
// ASSUMPTION (not in the docs): HIP-3 dexes list tradfi assets. The xyz
// dex lists stocks, commodities and indices (feed.py's xyz:GOLD,
// xyz:SP500); a HIP-3 crypto asset would land in Tradfi.
// A market in none of the four (e.g. another category) still shows
// under Trending and in search.

export type MarketTab = 'trending' | 'sports' | 'crypto' | 'econ' | 'tradfi'

export const MARKET_TABS: { value: MarketTab; label: string }[] = [
  { value: 'trending', label: 'Trending' },
  { value: 'sports', label: 'Sports' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'econ', label: 'Econ' },
  { value: 'tradfi', label: 'Tradfi' },
]

export function isTradfiAsset(underlying: string): boolean {
  return underlying.includes(':')
}

export function inTab(market: OutcomeMarket, tab: MarketTab): boolean {
  switch (tab) {
    case 'trending':
      return true
    case 'sports':
      return market.category === 'sports'
    case 'econ':
      return market.category === 'economics'
    case 'crypto':
      return market.underlying !== null && !isTradfiAsset(market.underlying)
    case 'tradfi':
      return market.underlying !== null && isTradfiAsset(market.underlying)
  }
}

export function filterByTab(markets: OutcomeMarket[], tab: MarketTab): OutcomeMarket[] {
  return tab === 'trending' ? markets : markets.filter((market) => inTab(market, tab))
}

export function countByTab(markets: OutcomeMarket[]): Record<MarketTab, number> {
  const counts: Record<MarketTab, number> = { trending: 0, sports: 0, crypto: 0, econ: 0, tradfi: 0 }
  for (const market of markets) {
    for (const { value } of MARKET_TABS) {
      if (inTab(market, value)) {
        counts[value] += 1
      }
    }
  }
  return counts
}
