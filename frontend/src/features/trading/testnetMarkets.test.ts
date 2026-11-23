import { describe, expect, it } from 'vitest'
import { 
    describeOutcome,
    outcomeVolumes,
    parseOutcomes,
    searchOutcomes,
    sideName,
    templateFields,
    trendingOutcomes, 
} from './testnetMarkets'

// Milestone 27.5: shapes taken from the 27.5 testnet probe.
const META = {
  outcomes: [
    {
      outcome: 20115,
      name: 'template:binaryPriceExternal',
      description: 'feed:Coinbase Exchange trades API: api.exchange.coinbase.com/products/BTC-USD/trades'
        + '|seconds:300|shortName:BTC-USD|threshold:100000|time:20261001-1600',
      sideSpecs: [{ name: 'template:Yes' }, { name: 'template:No' }],
    },
    {
      outcome: 10219,
      name: 'Exactly 4.3%',
      description: 'This outcome resolves to Yes if the one-decimal BLS CPI year-over-year ...',
      sideSpecs: [{ name: 'Yes' }, { name: 'No' }],
    },
    {
      outcome: 10225,
      name: 'June Fed rate change',
      description: 'The market resolves to Change if the upper bound of the target federal ...',
      sideSpecs: [{ name: 'Change' }, { name: 'No Change' }],
    },
    { outcome: 26391, name: 'template:sportsContestParticipant5', description: 'participant:Alavés', sideSpecs: [] },
    { outcome: 'bad', name: 'skipped' },
  ],
}

describe('testnet outcomes', () => {
  it('splits template descriptions, keeping colons inside values', () => {
    expect(templateFields('feed:api: x.com/a|shortName:BTC-USD')).toEqual({ feed: 'api: x.com/a', shortName: 'BTC-USD' })
  })

  it('strips the template prefix from side names', () => {
    expect(sideName('template:Yes', 'Yes')).toBe('Yes')
    expect(sideName('No Change', 'No')).toBe('No Change')
    expect(sideName(undefined, 'No')).toBe('No')
  })

  it('labels templated outcomes from their fields and readable ones by name', () => {
    expect(describeOutcome(20115, META.outcomes[0].name as string, META.outcomes[0].description as string))
      .toEqual({ label: 'BTC-USD · 100000 · 20261001-1600', detail: 'binaryPriceExternal' })
    expect(describeOutcome(10219, 'Exactly 4.3%', 'This outcome resolves').label).toBe('Exactly 4.3%')
    expect(describeOutcome(7, 'template fallback', '').label).toBe('Outcome 7')
  })

  it('parses outcomeMeta, skipping malformed entries', () => {
    const outcomes = parseOutcomes(META)
    expect(outcomes.map((o) => o.id)).toEqual([20115, 10219, 10225, 26391])
    expect(outcomes[2].sides).toEqual(['Change', 'No Change'])
    expect(outcomes[3]).toMatchObject({ label: 'Alavés', sides: ['Yes', 'No'] })
    expect(parseOutcomes(null)).toEqual([])
  })

  it('searches every typed word, newest first', () => {
    const outcomes = parseOutcomes(META)
    expect(searchOutcomes(outcomes, 'btc').map((o) => o.id)).toEqual([20115])
    expect(searchOutcomes(outcomes, 'resolves').map((o) => o.id)).toEqual([10225, 10219])
    expect(searchOutcomes(outcomes, 'fed change').map((o) => o.id)).toEqual([10225])
    expect(searchOutcomes(outcomes, '10219').map((o) => o.id)).toEqual([10219])
  })
})

describe('coins and trending (27.5b)', () => {
    it('finds an outcome by either side\'s coin number', () => {
      const outcomes = parseOutcomes(META)
      for (const query of ['102190', '102191', '#102190', '#102191']) {
        expect(searchOutcomes(outcomes, query).map((o) => o.id)).toEqual([10219])
      }
    })
  
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
      const outcomes = parseOutcomes(META)
      const volumes = new Map([[10219, 200], [10225, 0], [20115, 900]])
      expect(trendingOutcomes(outcomes, volumes).map((o) => o.id)).toEqual([20115, 10219])
      expect(trendingOutcomes(outcomes, volumes, 1).map((o) => o.id)).toEqual([20115])
      expect(trendingOutcomes(outcomes, new Map())).toEqual([])
    })
  })