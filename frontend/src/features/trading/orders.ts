import { privateKeyToAccount } from 'viem/accounts'
import { cancelAction, type OrderAction } from './actions'
import type { StoredAgent } from './agentStore'
import { nextNonce, postExchange, type Network } from './client'
import { exchangeBody, signL1Action } from './signing'
import { assetFromCoin } from './wire'

// Sending orders and cancels with the trading key (Milestone 27.6).
// Response shapes from the official docs ("Exchange endpoint"):
//   resting: {"resting": {"oid": 77738308}}
//   filled:  {"filled": {"totalSz": "0.02", "avgPx": "1891.4", "oid": 77747314}}
//   error:   {"error": "Order must have minimum value of $10."}
//   cancel:  "success"
// A refused REQUEST (bad signature, unknown key) is {"status": "err"},
// which postExchange throws as an ExchangeError.

export type OrderResult =
  | { kind: 'resting'; oid: number }
  | { kind: 'filled'; oid: number; totalSz: string; avgPx: string }
  | { kind: 'error'; message: string }

export function parseOrderStatus(status: unknown): OrderResult {
  const value = status as {
    resting?: { oid?: unknown }
    filled?: { oid?: unknown; totalSz?: unknown; avgPx?: unknown }
    error?: unknown
  } | null
  if (typeof value?.resting?.oid === 'number') {
    return { kind: 'resting', oid: value.resting.oid }
  }
  if (typeof value?.filled?.oid === 'number') {
    return {
      kind: 'filled',
      oid: value.filled.oid,
      totalSz: String(value.filled.totalSz),
      avgPx: String(value.filled.avgPx),
    }
  }
  if (typeof value?.error === 'string') {
    return { kind: 'error', message: value.error }
  }
  return { kind: 'error', message: `Unexpected order status: ${JSON.stringify(status)}` }
}

function firstStatus(data: unknown): unknown {
  return (data as { statuses?: unknown[] } | undefined)?.statuses?.[0]
}

// Signs the exact action the ticket showed and sends it.
export async function placeOrder(network: Network, agent: StoredAgent, action: OrderAction): Promise<OrderResult> {
  const nonce = nextNonce()
  const signature = await signL1Action(privateKeyToAccount(agent.privateKey), action, nonce, network.isMainnet)
  const result = await postExchange(network, exchangeBody(action, nonce, signature))
  return parseOrderStatus(firstStatus(result.response.data))
}

// Cancels one order. Returns null on success, or Hyperliquid's reason.
export async function cancelOrder(network: Network, agent: StoredAgent, asset: number, oid: number): Promise<string | null> {
  const action = cancelAction([{ asset, oid }])
  const nonce = nextNonce()
  const signature = await signL1Action(privateKeyToAccount(agent.privateKey), action, nonce, network.isMainnet)
  const result = await postExchange(network, exchangeBody(action, nonce, signature))
  const status = firstStatus(result.response.data)
  if (status === 'success') {
    return null
  }
  const error = (status as { error?: unknown } | undefined)?.error
  return typeof error === 'string' ? error : `Unexpected cancel status: ${JSON.stringify(status)}`
}

export interface OpenOutcomeOrder {
  coin: string  // "#102190"
  asset: number  // 100102190
  oid: number
  isBuy: boolean
  limitPx: string
  sz: string  // still open
  origSz: string
  timestamp: number
}

// frontendOpenOrders -> this account's open OUTCOME orders, newest first.
// side "B" is a bid (buy), "A" an ask (sell).
export function parseOpenOutcomeOrders(response: unknown): OpenOutcomeOrder[] {
  const orders: OpenOutcomeOrder[] = []
  for (const raw of Array.isArray(response) ? response : []) {
    const order = raw as Record<string, unknown>
    if (typeof order.coin !== 'string' || !order.coin.startsWith('#') || typeof order.oid !== 'number') {
      continue  // perps and spot orders are not shown here
    }
    let asset: number
    try {
      asset = assetFromCoin(order.coin)
    } catch {
      continue
    }
    orders.push({
      coin: order.coin,
      asset,
      oid: order.oid,
      isBuy: order.side === 'B',
      limitPx: String(order.limitPx),
      sz: String(order.sz),
      origSz: String(order.origSz ?? order.sz),
      timestamp: typeof order.timestamp === 'number' ? order.timestamp : 0,
    })
  }
  return orders.sort((a, b) => b.timestamp - a.timestamp)
}