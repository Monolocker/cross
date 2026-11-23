// GET /testnet/outcomes (Milestone 27.7b): testnet outcomes titled by
// the backend's normalize pipeline, the same one as mainnet markets.
export interface TestnetOutcomeRow {
    id: string
    title: string
    sides: string[]
    payout: 'binary' | 'scalar'
  }