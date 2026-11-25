import { describe, expect, it } from 'vitest'
import { outcomeCoin, parseOutcomeFills, parseOutcomeOrderHistory } from './history'

// Milestone 29.0. Entries follow the official docs' example shapes; the
// outcome coin and values are made up for the test.
describe('outcomeCoin', () => {
  it('reads "#<encoding>" coins and nothing else', () => {
    expect(outcomeCoin('#102191')).toEqual({ coin: '#102191', outcomeId: 10219, side: 1 })
    expect(outcomeCoin('AVAX')).toBeNull()
    expect(outcomeCoin('@107')).toBeNull()
    expect(outcomeCoin('xyz:XYZ100')).toBeNull()
    expect(outcomeCoin('#12')).toBeNull()  // side 2 does not exist
  })
})

describe('parseOutcomeFills', () => {
  it('keeps outcome fills, newest first', () => {
    const fills = parseOutcomeFills([
      { coin: 'AVAX', px: '18.435', sz: '93.53', side: 'B', time: 1681222254710, dir: 'Open Long', closedPnl: '0.0', oid: 90542681, fee: '0.01', feeToken: 'USDC', tid: 1 },
      { coin: '#102190', px: '0.55', sz: '40.0', side: 'A', time: 1764000000000, dir: 'Sell', closedPnl: '1.2', oid: 77, crossed: true, fee: '0.0154', feeToken: 'USDC', tid: 5 },
      { coin: '#102190', px: '0.52', sz: '40.0', side: 'B', time: 1763900000000, dir: 'Buy', closedPnl: '0.0', oid: 70, crossed: true, fee: '0.0', feeToken: ' USDC', tid: 4 },
    ])
    expect(fills.map((fill) => fill.oid)).toEqual([77, 70])
    expect(fills[0]).toEqual({
      coin: '#102190', outcomeId: 10219, side: 0, time: 1764000000000, isBuy: false, px: '0.55', sz: '40.0',
      dir: 'Sell', closedPnl: '1.2', fee: '0.0154', feeToken: 'USDC', oid: 77, tid: 5, crossed: true,
    })
    expect(fills[1].feeToken).toBe('USDC')  // the docs' example has " USDC"
  })

  it('returns nothing for a malformed answer', () => {
    expect(parseOutcomeFills({ error: 'x' })).toEqual([])
    expect(parseOutcomeFills([{ coin: '#102190' }])).toEqual([])
  })
})

describe('parseOutcomeOrderHistory', () => {
  it('keeps outcome orders with their final status, newest first', () => {
    const records = parseOutcomeOrderHistory([
      { order: { coin: 'ETH', side: 'A', limitPx: '2412.7', sz: '0.0', oid: 1, timestamp: 1724361546645, orderType: 'Market', origSz: '0.0076', tif: 'FrontendMarket' }, status: 'filled', statusTimestamp: 1724361546645 },
      { order: { coin: '#102191', side: 'B', limitPx: '0.4', sz: '5.0', oid: 9, timestamp: 1763000000000, orderType: 'Limit', origSz: '5.0', tif: 'Gtc' }, status: 'canceled', statusTimestamp: 1763000500000 },
      { order: { coin: '#102190', side: 'A', limitPx: '0.50263', sz: '0.0', oid: 77, timestamp: 1764000000000, orderType: 'Limit', origSz: '40.0', tif: 'Ioc' }, status: 'filled', statusTimestamp: 1764000000001 },
    ])
    expect(records.map((record) => [record.oid, record.status])).toEqual([[77, 'filled'], [9, 'canceled']])
    expect(records[1]).toMatchObject({ outcomeId: 10219, side: 1, isBuy: true, limitPx: '0.4', origSz: '5.0', remainingSz: '5.0', tif: 'Gtc', placedAt: 1763000000000 })
  })
})
