import { describe, expect, it } from 'vitest'
import { outcomeVolumes, searchOutcomes, toTestnetOutcomes, trendingOutcomes } from './testnetMarkets'

// Milestone 27.7b: rows as /testnet/outcomes serves them, titled by the
// backend's normalize pipeline (tested there with live shapes).
const ROWS = [
  { id: '20115', title: 'BTC-USD above 100000 at Oct 01, 2026 16:00 UTC?', sides: ['Yes', 'No'], payout: 'binary' as const },
  { id: '10219', title: 'Exactly 4.3% — May 2026 CPI year-over-year', sides: ['Yes', 'No'], payout: 'binary' as const },
  { id: '27327', title: 'Las Vegas Raiders v Cleveland Browns', sides: ['LV', 'CLE'], payout: 'binary' as const },
  { id: '20354', title: 'BTC between 90000 and 110000 at Oct 15, 2026 16:00 UTC', sides: ['Long', 'Short'], payout: 'scalar' as const },
  { id: 'bad', title: 'skipped', sides: [], payout: 'binary' as const },
]

describe('testnet outcomes from the backend', () => {
  it('keeps the backend titles and side names, skipping malformed ids', () => {
    const outcomes = toTestnetOutcomes(ROWS)
    expect(outcomes.map((o) => o.id)).toEqual([20115, 10219, 27327, 20354])
    expect(outcomes[2]).toMatchObject({ label: 'Las Vegas Raiders v Cleveland Browns', sides: ['LV', 'CLE'], detail: '' })
    expect(outcomes[3].detail).toBe('scalar: pays in proportion')
  })

  it('falls back to Yes/No when a side name is missing', () => {
    expect(toTestnetOutcomes([{ id: '1', title: 't', sides: [], payout: 'binary' }])[0].sides).toEqual(['Yes', 'No'])
  })

  it('searches titles, side names and both coins, newest first', () => {
    const outcomes = toTestnetOutcomes(ROWS)
    expect(searchOutcomes(outcomes, 'raiders').map((o) => o.id)).toEqual([27327])
    expect(searchOutcomes(outcomes, 'cle').map((o) => o.id)).toEqual([27327])
    expect(searchOutcomes(outcomes, 'btc').map((o) => o.id)).toEqual([20354, 20115])
    expect(searchOutcomes(outcomes, 'cpi 4.3').map((o) => o.id)).toEqual([10219])
    for (const query of ['102190', '102191', '#102190', '#102191', '10219']) {
      expect(searchOutcomes(outcomes, query).map((o) => o.id)).toEqual([10219])
    }
  })
})

describe('volumes and trending', () => {
  it('adds both sides\' 24h USDC volume per outcome, ignoring non-outcome coins', () => {
    const response = [
      { universe: [], tokens: [] },
      [
        { coin: '#102190', dayNtlVlm: '120.5' },
        { coin: '#102191', dayNtlVlm: '79.5' },
        { coin: '#102250', dayNtlVlm: '0.0' },
        { coin: 'PURR/USDC', dayNtlVlm: '99999' },
        { coin: '#201150', dayNtlVlm: 'bad' },
      ],
    ]
    const volumes = outcomeVolumes(response)
    expect(volumes.get(10219)).toBe(200)
    expect(volumes.get(10225)).toBe(0)
    expect(volumes.has(20115)).toBe(false)
    expect(volumes.size).toBe(2)
    expect(outcomeVolumes(null).size).toBe(0)
  })

  it('ranks trending outcomes by volume, leaving out those with none', () => {
    const outcomes = toTestnetOutcomes(ROWS)
    const volumes = new Map([[10219, 200], [27327, 0], [20115, 900]])
    expect(trendingOutcomes(outcomes, volumes).map((o) => o.id)).toEqual([20115, 10219])
    expect(trendingOutcomes(outcomes, volumes, 1).map((o) => o.id)).toEqual([20115])
    expect(trendingOutcomes(outcomes, new Map())).toEqual([])
  })
})