import { recoverTypedDataAddress, type Hex } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { limitOrder, orderAction } from './actions'
import { TESTNET } from './client'
import { cancelOrder, parseOpenOutcomeOrders, parseOrderStatus, placeOrder } from './orders'
import { actionHash, l1TypedData } from './signing'

// Milestone 27.6: sending orders and cancels, against a fake network.
// Status shapes are the official docs' examples ("Exchange endpoint").
const AGENT_KEY: Hex = `0x${'11'.repeat(32)}`
const AGENT = { privateKey: AGENT_KEY, address: '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a' as const, name: 'cross', approvedAt: 0, validUntil: 4102444800000 }
const BUY = orderAction([limitOrder({ asset: 100_102_190, isBuy: true, price: '0.4', size: '2', tif: 'Gtc' })])

function fakeFetch(answer: unknown) {
  const calls: { url: string; body: { action: object; nonce: number; signature: { r: Hex; s: Hex; v: number } } }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => answer }
  }))
  return calls
}

async function signerOf(body: { action: object; nonce: number; signature: { r: Hex; s: Hex; v: number } }) {
  const { r, s, v } = body.signature
  const signature = `0x${r.slice(2).padStart(64, '0')}${s.slice(2).padStart(64, '0')}${v.toString(16)}` as Hex
  return (await recoverTypedDataAddress({ ...l1TypedData(actionHash(body.action, body.nonce), false), signature })).toLowerCase()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('order statuses (docs examples)', () => {
  it('reads resting, filled and error', () => {
    expect(parseOrderStatus({ resting: { oid: 77738308 } })).toEqual({ kind: 'resting', oid: 77738308 })
    expect(parseOrderStatus({ filled: { totalSz: '0.02', avgPx: '1891.4', oid: 77747314 } }))
      .toEqual({ kind: 'filled', oid: 77747314, totalSz: '0.02', avgPx: '1891.4' })
    expect(parseOrderStatus({ error: 'Order must have minimum value of $10.' }))
      .toEqual({ kind: 'error', message: 'Order must have minimum value of $10.' })
      expect(parseOrderStatus(undefined).kind).toBe('error')
    })
  
    it('reads the live testnet answers from 2026-11-23', () => {
      expect(parseOrderStatus({ error: 'Order must have minimum value of 1 USDC. asset=100102190' }))
        .toEqual({ kind: 'error', message: 'Order must have minimum value of 1 USDC. asset=100102190' })
      expect(parseOrderStatus({ filled: { totalSz: '50.0', avgPx: '0.71579', oid: 65846827721 } }))
        .toEqual({ kind: 'filled', oid: 65846827721, totalSz: '50.0', avgPx: '0.71579' })
      expect(parseOrderStatus({ resting: { oid: 65846762597 } })).toEqual({ kind: 'resting', oid: 65846762597 })
    })
  })

describe('placeOrder', () => {
  it('sends exactly the reviewed action, signed by the agent for testnet', async () => {
    const calls = fakeFetch({ status: 'ok', response: { type: 'order', data: { statuses: [{ resting: { oid: 42 } }] } } })
    expect(await placeOrder(TESTNET, AGENT, BUY)).toEqual({ kind: 'resting', oid: 42 })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.hyperliquid-testnet.xyz/exchange')
    expect(calls[0].body.action).toEqual(BUY)
    expect(await signerOf(calls[0].body)).toBe(AGENT.address)
  })

  it('reports an order-level error as a result, a request-level error as a throw', async () => {
    fakeFetch({ status: 'ok', response: { type: 'order', data: { statuses: [{ error: 'Insufficient balance' }] } } })
    expect(await placeOrder(TESTNET, AGENT, BUY)).toEqual({ kind: 'error', message: 'Insufficient balance' })
    fakeFetch({ status: 'err', response: 'User or API Wallet 0x19e7 does not exist.' })
    await expect(placeOrder(TESTNET, AGENT, BUY)).rejects.toThrow('does not exist')
  })
})

describe('cancelOrder', () => {
  it('sends a signed cancel and returns null on success', async () => {
    const calls = fakeFetch({ status: 'ok', response: { type: 'cancel', data: { statuses: ['success'] } } })
    expect(await cancelOrder(TESTNET, AGENT, 100_102_190, 42)).toBeNull()
    expect(calls[0].body.action).toEqual({ type: 'cancel', cancels: [{ a: 100_102_190, o: 42 }] })
    expect(await signerOf(calls[0].body)).toBe(AGENT.address)
  })

  it('returns Hyperliquid\'s reason when the cancel is refused', async () => {
    fakeFetch({ status: 'ok', response: { type: 'cancel', data: { statuses: [{ error: 'Order was never placed, already canceled, or filled. asset=100102190' }] } } })
    expect(await cancelOrder(TESTNET, AGENT, 100_102_190, 42)).toMatch(/^Order was never placed/)
  })
})

describe('open orders', () => {
  it('keeps outcome orders only, newest first, with their asset ids', () => {
    const orders = parseOpenOutcomeOrders([
      { coin: '#102190', side: 'B', limitPx: '0.4', sz: '2.0', origSz: '2.0', oid: 1, timestamp: 100 },
      { coin: 'BTC', side: 'B', limitPx: '50000', sz: '0.1', oid: 2, timestamp: 300 },
      { coin: '#102191', side: 'A', limitPx: '0.7', sz: '1.0', origSz: '3.0', oid: 3, timestamp: 200 },
      { coin: '#102192', side: 'B', limitPx: '0.1', sz: '1.0', oid: 4, timestamp: 400 },
    ])
    expect(orders.map((o) => [o.oid, o.asset, o.isBuy, o.sz, o.origSz])).toEqual([
      [3, 100_102_191, false, '1.0', '3.0'],
      [1, 100_102_190, true, '2.0', '2.0'],
    ])
    expect(parseOpenOutcomeOrders(null)).toEqual([])
  })
})