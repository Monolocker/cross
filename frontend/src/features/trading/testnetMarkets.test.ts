import { describe, expect, it } from 'vitest'
import { describeOutcome, parseOutcomes, searchOutcomes, sideName, templateFields } from './testnetMarkets'

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