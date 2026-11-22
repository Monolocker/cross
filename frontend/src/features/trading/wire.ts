// How numbers and outcome assets are written in Hyperliquid actions
// (Milestone 27.3). Prices and sizes travel as decimal STRINGS, and the
// signature covers those exact characters: "0.50" and "0.5" are the same
// price but different bytes, so a different signature. The official SDK
// writes the shortest form (float_to_wire: no trailing zeros, no
// trailing point), and so does toWire.

const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/

// "0.50" -> "0.5", "2.000" -> "2", "100" -> "100". Only plain,
// non-negative decimals are accepted: no signs, exponents or spaces.
export function toWire(value: string): string {
  if (!DECIMAL.test(value)) {
    throw new Error(`Not a plain decimal: "${value}"`)
  }
  if (!value.includes('.')) {
    return value
  }
  return value.replace(/0+$/, '').replace(/\.$/, '')
}

// Asset ids for outcomes (official docs, "Asset IDs"): encoding is
// 10 * outcome + side, and the asset id is 100_000_000 + encoding.
const OUTCOME_ASSET_BASE = 100_000_000

export function outcomeAsset(outcome: number, side: 0 | 1): number {
  if (!Number.isSafeInteger(outcome) || outcome < 0) {
    throw new Error(`Not an outcome id: ${outcome}`)
  }
  return OUTCOME_ASSET_BASE + 10 * outcome + side
}

// The coin strings this app already uses ("#372861") carry the same
// encoding, so they convert directly.
export function assetFromCoin(coin: string): number {
  const match = /^#(\d+)$/.exec(coin)
  if (match === null) {
    throw new Error(`Not an outcome coin: "${coin}"`)
  }
  const encoding = Number(match[1])
  if (!Number.isSafeInteger(encoding) || encoding % 10 > 1) {
    throw new Error(`Not an outcome coin: "${coin}"`)
  }
  return OUTCOME_ASSET_BASE + encoding
}