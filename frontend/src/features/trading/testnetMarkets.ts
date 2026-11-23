import type { TestnetOutcomeRow } from '../../types/testnet'

// Testnet outcomes for the test bench (Milestones 27.5, 27.7b). Titles
// come from our backend (/testnet/outcomes), which runs testnet's
// outcomeMeta and outcomeTemplates through the same normalize pipeline
// as mainnet: template wording, parent questions, team side names.

export interface TestnetOutcome {
  id: number
  label: string  // what the picker shows
  detail: string  // extra context, '' when there is none
  sides: [string, string]
  search: string  // lowercased text the search box matches
}

export function toTestnetOutcomes(rows: TestnetOutcomeRow[]): TestnetOutcome[] {
  const outcomes: TestnetOutcome[] = []
  for (const row of rows) {
    const id = Number(row.id)
    if (!Number.isSafeInteger(id)) {
      continue
    }
    const sides: [string, string] = [row.sides[0] ?? 'Yes', row.sides[1] ?? 'No']
    outcomes.push({
      id,
      label: row.title,
      detail: row.payout === 'scalar' ? 'scalar: pays in proportion' : '',
      sides,
      // Also match the coins traders see ("#102190") and plain numbers.
      search: [id, `#${10 * id}`, `#${10 * id + 1}`, 10 * id, 10 * id + 1, row.title, ...sides]
        .join(' ')
        .toLowerCase(),
    })
  }
  return outcomes
}

// Every word typed must appear somewhere; newest outcomes first.
export function searchOutcomes(outcomes: TestnetOutcome[], query: string, limit = 20): TestnetOutcome[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '')
  return outcomes
    .filter((outcome) => words.every((word) => outcome.search.includes(word)))
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
}

// spotMetaAndAssetCtxs -> 24h USDC volume per outcome (both sides added).
// Documented for spot pairs; the backend observed in M17.5 that outcome
// coins appear in it too, each with dayNtlVlm (USDC traded in 24h).
export function outcomeVolumes(response: unknown): Map<number, number> {
  const contexts = Array.isArray(response) ? (response[1] as { coin?: unknown; dayNtlVlm?: unknown }[]) : null
  const volumes = new Map<number, number>()
  for (const context of Array.isArray(contexts) ? contexts : []) {
    const match = typeof context.coin === 'string' ? /^#(\d+)$/.exec(context.coin) : null
    const volume = Number(context.dayNtlVlm)
    if (match !== null && Number.isFinite(volume)) {
      const outcome = Math.floor(Number(match[1]) / 10)
      volumes.set(outcome, (volumes.get(outcome) ?? 0) + volume)
    }
  }
  return volumes
}

// The busiest outcomes over 24h; outcomes with no volume are left out.
export function trendingOutcomes(outcomes: TestnetOutcome[], volumes: Map<number, number>, limit = 10): TestnetOutcome[] {
  return outcomes
    .filter((outcome) => (volumes.get(outcome.id) ?? 0) > 0)
    .sort((a, b) => (volumes.get(b.id) ?? 0) - (volumes.get(a.id) ?? 0))
    .slice(0, limit)
}