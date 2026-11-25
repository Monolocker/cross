// Trade history and order history for outcome markets (Milestone 29.0).
// Shapes from the official info endpoint docs:
//   userFills:        [{coin, px, sz, side "B"|"A", time, dir, closedPnl,
//                       fee, feeToken, oid, tid, crossed, ...}],
//                     "at most 2000 most recent fills";
//   historicalOrders: [{order: {coin, side, limitPx, sz, origSz, oid,
//                       timestamp, orderType, tif, ...}, status,
//                       statusTimestamp}], "at most 2000 most recent".
// Outcome coins are "#<encoding>" (encoding = 10 x outcome + side), as in
// open orders; perp and spot entries are left out.

export interface OutcomeCoin {
  coin: string  // "#102191"
  outcomeId: number  // 10219
  side: 0 | 1
}

export function outcomeCoin(coin: unknown): OutcomeCoin | null {
  const match = typeof coin === 'string' ? /^#(\d+)$/.exec(coin) : null
  if (match === null) {
    return null
  }
  const encoding = Number(match[1])
  if (encoding % 10 > 1) {
    return null
  }
  return { coin: `#${encoding}`, outcomeId: Math.floor(encoding / 10), side: (encoding % 10) as 0 | 1 }
}

export interface OutcomeFill extends OutcomeCoin {
  time: number  // ms
  isBuy: boolean
  px: string
  sz: string
  dir: string  // as Hyperliquid words it, e.g. "Buy", "Sell"
  closedPnl: string  // before fees
  fee: string
  feeToken: string
  oid: number
  tid: number | null
  crossed: boolean | null  // true = taker
}

export function parseOutcomeFills(response: unknown): OutcomeFill[] {
  const fills: OutcomeFill[] = []
  for (const raw of Array.isArray(response) ? response : []) {
    const fill = raw as Record<string, unknown>
    const coin = outcomeCoin(fill.coin)
    if (coin === null || typeof fill.oid !== 'number' || typeof fill.time !== 'number') {
      continue
    }
    fills.push({
      ...coin,
      time: fill.time,
      isBuy: fill.side === 'B',
      px: String(fill.px),
      sz: String(fill.sz),
      dir: typeof fill.dir === 'string' ? fill.dir : '',
      closedPnl: String(fill.closedPnl ?? '0'),
      fee: String(fill.fee ?? '0'),
      feeToken: typeof fill.feeToken === 'string' ? fill.feeToken.trim() : '',
      oid: fill.oid,
      tid: typeof fill.tid === 'number' ? fill.tid : null,
      crossed: typeof fill.crossed === 'boolean' ? fill.crossed : null,
    })
  }
  return fills.sort((a, b) => b.time - a.time)
}

export interface OutcomeOrderRecord extends OutcomeCoin {
  time: number  // statusTimestamp, ms
  placedAt: number  // order.timestamp, ms
  isBuy: boolean
  limitPx: string
  origSz: string
  remainingSz: string  // order.sz: what was left when the status was set
  status: string  // "filled", "open", "canceled", "rejected", ...
  orderType: string  // "Limit", "Market", ...
  tif: string | null  // "Gtc", "Ioc", ...
  oid: number
}

export function parseOutcomeOrderHistory(response: unknown): OutcomeOrderRecord[] {
  const records: OutcomeOrderRecord[] = []
  for (const raw of Array.isArray(response) ? response : []) {
    const entry = raw as { order?: Record<string, unknown>; status?: unknown; statusTimestamp?: unknown }
    const order = entry.order
    const coin = outcomeCoin(order?.coin)
    if (order === undefined || coin === null || typeof order.oid !== 'number') {
      continue
    }
    const placedAt = typeof order.timestamp === 'number' ? order.timestamp : 0
    records.push({
      ...coin,
      time: typeof entry.statusTimestamp === 'number' ? entry.statusTimestamp : placedAt,
      placedAt,
      isBuy: order.side === 'B',
      limitPx: String(order.limitPx),
      origSz: String(order.origSz ?? order.sz),
      remainingSz: String(order.sz),
      status: typeof entry.status === 'string' ? entry.status : 'unknown',
      orderType: typeof order.orderType === 'string' ? order.orderType : '',
      tif: typeof order.tif === 'string' ? order.tif : null,
      oid: order.oid,
    })
  }
  return records.sort((a, b) => b.time - a.time)
}
