// Testnet outcomes for the test bench (Milestone 27.5). Testnet has its
// own markets (different ids from mainnet), read from outcomeMeta.
//
// The 27.5 probe found two naming styles there:
//   readable:  name "France", description "This outcome resolves to Yes if ..."
//   templated: name "template:binaryPrice", description
//              "shortName:BTC-USD|threshold:100000|time:20261001-1600|..."
// and side names like "Yes" or "template:Yes".

export interface TestnetOutcome {
    id: number
    label: string  // what the picker shows
    detail: string  // template kind or the start of the description
    sides: [string, string]
    search: string  // lowercased text the search box matches
  }
  
  const TEMPLATE_PREFIX = /^template[: ]\s*/
  // Template fields that best tell outcomes apart, in the order shown.
  const LABEL_FIELDS = ['shortName', 'participant', 'participantA', 'participantB', 'threshold', 'time']
  
  // "a:1|b:2" -> {a: "1", b: "2"}. Values may contain ":" (e.g. URLs).
  export function templateFields(description: string): Record<string, string> {
    const fields: Record<string, string> = {}
    for (const part of description.split('|')) {
      const colon = part.indexOf(':')
      if (colon > 0) {
        fields[part.slice(0, colon).trim()] = part.slice(colon + 1).trim()
      }
    }
    return fields
  }
  
  export function sideName(raw: unknown, fallback: string): string {
    const name = typeof raw === 'string' ? raw.replace(TEMPLATE_PREFIX, '').trim() : ''
    return name === '' ? fallback : name
  }
  
  export function describeOutcome(id: number, name: string, description: string): { label: string; detail: string } {
    if (!TEMPLATE_PREFIX.test(name)) {
      return { label: name, detail: description.slice(0, 120) }
    }
    const kind = name.replace(TEMPLATE_PREFIX, '').trim() || 'template'
    const fields = templateFields(description)
    const picked = LABEL_FIELDS.filter((key) => fields[key] !== undefined).map((key) => fields[key])
    const label = picked.length > 0 ? picked.join(' · ') : `Outcome ${id}`
    return { label, detail: kind }
  }
  
  interface RawOutcome {
    outcome?: unknown
    name?: unknown
    description?: unknown
    sideSpecs?: { name?: unknown }[]
  }
  
  export function parseOutcomes(meta: unknown): TestnetOutcome[] {
    const raw = (meta as { outcomes?: RawOutcome[] } | null)?.outcomes
    if (!Array.isArray(raw)) {
      return []
    }
    const outcomes: TestnetOutcome[] = []
    for (const item of raw) {
      if (typeof item.outcome !== 'number' || !Number.isSafeInteger(item.outcome)) {
        continue
      }
      const name = typeof item.name === 'string' ? item.name : ''
      const description = typeof item.description === 'string' ? item.description : ''
      const { label, detail } = describeOutcome(item.outcome, name, description)
      const sides: [string, string] = [sideName(item.sideSpecs?.[0]?.name, 'Yes'), sideName(item.sideSpecs?.[1]?.name, 'No')]
      outcomes.push({
        id: item.outcome,
        label,
        detail,
        sides,
        // Also match the coins traders see ("#102190") and plain numbers.
        search: [
          item.outcome, `#${10 * item.outcome}`, `#${10 * item.outcome + 1}`,
          10 * item.outcome, 10 * item.outcome + 1, label, detail, name, description,
        ].join(' ').toLowerCase(),
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