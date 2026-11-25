import { describe, expect, it } from 'vitest'
import {
    availableBalances,
    bookTop,
    checkTicket,
    describeOrderResult,
    estimateFill,
    marketLimitPrice,
    type BookTop,
    type TicketInput,
  } from './ticket'

// Milestone 27.5: ticket rules. The book is #102190's from the 27.5
// testnet probe: bid 0.55263 x 30, ask 0.70526 x 22.
const BID = { px: 0.55263, sz: 30 }
const ASK = { px: 0.70526, sz: 22 }
const BOOK: BookTop = { bestBid: BID, bestAsk: ASK, bids: [BID], asks: [ASK] }
const FUNDS = { availableUsdc: 999.906338, heldContracts: 0 }
const BUY: TicketInput = { outcomeId: 10219, side: 0, isBuy: true, kind: 'limit', price: '0.5', size: '10', tif: 'Gtc' }

describe('price and size rules', () => {
  it('accepts a valid order and builds the exact action', () => {
    const check = checkTicket(BUY, BOOK, FUNDS)
    expect(check.errors).toEqual([])
    expect(check.notional).toBeCloseTo(5)
    expect(check.action).toEqual({
      type: 'order',
      orders: [{ a: 100_102_190, b: true, p: '0.5', s: '10', r: false, t: { limit: { tif: 'Gtc' } } }],
      grouping: 'na',
    })
  })

  it('writes the price in wire form', () => {
    expect(checkTicket({ ...BUY, price: '0.50000' }, BOOK, FUNDS).action?.orders[0].p).toBe('0.5')
  })

  it('uses side 1 for the second side', () => {
    expect(checkTicket({ ...BUY, side: 1 }, BOOK, FUNDS).action?.orders[0].a).toBe(100_102_191)
  })

  it('rejects prices outside (0, 1), malformed or with more than 5 decimals', () => {
    for (const price of ['0', '1', '1.5', '-0.5', '.5', 'abc', '0.5e-1']) {
      expect(checkTicket({ ...BUY, price }, BOOK, FUNDS).errors[0]).toMatch(/between 0 and 1/)
    }
    expect(checkTicket({ ...BUY, price: '0.123456' }, BOOK, FUNDS).errors[0]).toMatch(/at most 5 decimals/)
    expect(checkTicket({ ...BUY, price: '0.12345' }, BOOK, FUNDS).errors).toEqual([])
    expect(checkTicket({ ...BUY, price: '' }, BOOK, FUNDS).errors).toContain('Enter a price.')
  })

  it('rejects sizes that are not whole contracts', () => {
    for (const size of ['0', '1.5', '-1', '01', 'x']) {
      expect(checkTicket({ ...BUY, size }, BOOK, FUNDS).errors[0]).toMatch(/whole number/)
    }
    expect(checkTicket({ ...BUY, size: '' }, BOOK, FUNDS).errors).toContain('Enter a size.')
  })
})

describe('funds', () => {
  it('blocks a buy worth more than the available USDC', () => {
    const check = checkTicket({ ...BUY, price: '0.9', size: '2000' }, BOOK, FUNDS)
    expect(check.errors[0]).toMatch(/needs up to 1800.00 USDC; 999.91 is available/)
    expect(check.action).toBeNull()
  })

  it('only sells contracts you hold', () => {
    const sell = { ...BUY, isBuy: false, price: '0.6', size: '5' }
    expect(checkTicket(sell, BOOK, FUNDS).errors[0]).toMatch(/You hold 0 contracts/)
    expect(checkTicket(sell, BOOK, { ...FUNDS, heldContracts: 5 }).errors).toEqual([])
  })

  it('notes a balance that is still loading', () => {
    expect(checkTicket(BUY, BOOK, { availableUsdc: null, heldContracts: null }).notes).toContain('Your USDC balance is still loading.')
  })
})

describe('what would happen', () => {
  it('rests a GTC buy below the ask', () => {
    expect(checkTicket(BUY, BOOK, FUNDS).notes[0]).toMatch(/rest on the book as a bid at 0.5/)
  })

  it('fills a buy at or above the ask, warning when it exceeds the best level', () => {
    const notes = checkTicket({ ...BUY, price: '0.71', size: '30' }, BOOK, FUNDS).notes
    expect(notes[0]).toMatch(/Marketable: it would fill now, starting at 0.70526 \(22 contracts there\)/)
    expect(notes[1]).toMatch(/More than the best level holds/)
  })

  it('cancels an IOC that cannot fill', () => {
    expect(checkTicket({ ...BUY, tif: 'Ioc' }, BOOK, FUNDS).notes[0]).toMatch(/canceled immediately/)
  })

  it('fills a sell at or below the bid', () => {
    const sell = { ...BUY, isBuy: false, price: '0.55', size: '5' }
    expect(checkTicket(sell, BOOK, { ...FUNDS, heldContracts: 5 }).notes[0]).toMatch(/starting at 0.55263/)
  })

  it('says nothing about execution when the book is unknown', () => {
    expect(checkTicket(BUY, null, FUNDS).notes).toEqual([])
  })
})

describe('parsers', () => {
  it('reads the top of an l2Book', () => {
    expect(bookTop({ levels: [[{ px: '0.55263', sz: '30.0' }], [{ px: '0.70526', sz: '22.0' }]] })).toEqual(BOOK)
    expect(bookTop({ levels: [[{ px: '0.1', sz: '133.0' }], []] }))
      .toEqual({ bestBid: { px: 0.1, sz: 133 }, bestAsk: null, bids: [{ px: 0.1, sz: 133 }], asks: [] })
    expect(bookTop(null)).toBeNull()
  })

  it('computes available balances (total - hold), including outcome contracts', () => {
    const available = availableBalances({
      balances: [
        { coin: 'USDC', total: '999.906338', hold: '10.0' },
        { coin: '+102190', total: '5.0', hold: '0.0' },
      ],
    })
    expect(available.get('USDC')).toBeCloseTo(989.906338)
    expect(available.get('+102190')).toBe(5)
    expect(availableBalances(undefined).size).toBe(0)
  })
})


describe('live testnet answers (2026-11-23)', () => {
    it('blocks orders worth less than 1 USDC, as testnet did', () => {
      // Order A1: 2 contracts at 0.1 was answered "Order must have minimum value of 1 USDC."
      const tooSmall = checkTicket({ ...BUY, price: '0.1', size: '2' }, BOOK, FUNDS)
      expect(tooSmall.errors[0]).toMatch(/at least 1 USDC .*this one is 0.20/)
      expect(tooSmall.action).toBeNull()
      expect(checkTicket({ ...BUY, price: '0.1', size: '10' }, BOOK, FUNDS).errors).toEqual([])  // exactly 1
      expect(checkTicket({ ...BUY, price: '0.1', size: '100' }, BOOK, FUNDS).errors).toEqual([])  // order A2 rested
      const smallSell = { ...BUY, isBuy: false, price: '0.5', size: '1' }
      expect(checkTicket(smallSell, BOOK, { ...FUNDS, heldContracts: 1 }).errors[0]).toMatch(/at least 1 USDC/)
    })
  
    it('describes a partial IOC fill, as order B was', () => {
      const result = { kind: 'filled' as const, oid: 65846827721, totalSz: '50.0', avgPx: '0.71579' }
      expect(describeOrderResult(result, '100', 'Testnet')).toBe(
        'Filled 50 of 100 at an average of 0.71579 (order 65846827721). The other 50 were canceled: IOC never rests.',
      )
    })
  
    it('describes a complete fill, a resting order and a rejection', () => {
      expect(describeOrderResult({ kind: 'filled', oid: 65846933309, totalSz: '42.0', avgPx: '0.53684' }, '42', 'Testnet'))
        .toBe('Filled 42 at an average of 0.53684 (order 65846933309).')
      expect(describeOrderResult({ kind: 'resting', oid: 65846762597 }, '100', 'Testnet'))
        .toMatch(/^Resting on Testnet: order 65846762597\./)
      expect(describeOrderResult({ kind: 'error', message: 'Order must have minimum value of 1 USDC. asset=100102190' }, '2', 'Testnet'))
        .toBe('Hyperliquid rejected the order: Order must have minimum value of 1 USDC. asset=100102190')
    })
  })

// Milestone 28.0b: a market order is an IOC limit priced from the book,
// as the official SDK's market_open does ("an aggressive Limit Order IoC").
describe('market orders (28.0b)', () => {
  // A deeper book: three ask levels, two bid levels.
  const DEEP: BookTop = {
    bestBid: BID,
    bestAsk: ASK,
    bids: [BID, { px: 0.5, sz: 10 }],
    asks: [ASK, { px: 0.72, sz: 10 }, { px: 0.8, sz: 100 }],
  }
  const MARKET_BUY: TicketInput = { ...BUY, kind: 'market', price: '', size: '25' }

  it('prices a buy at the best ask + 0.05 and a sell at the best bid - 0.05, in 5 decimals', () => {
    expect(marketLimitPrice(DEEP, true)).toBe('0.75526')
    expect(marketLimitPrice(DEEP, false)).toBe('0.50263')
    const round = { ...DEEP, bestAsk: { px: 0.7, sz: 1 }, bestBid: { px: 0.3, sz: 1 } }
    expect(marketLimitPrice(round, true)).toBe('0.75')  // wire form, no float drift
    expect(marketLimitPrice(round, false)).toBe('0.25')
  })

  it('keeps the price inside 0.00001 .. 0.99999', () => {
    const edges = { ...DEEP, bestAsk: { px: 0.97, sz: 1 }, bestBid: { px: 0.02, sz: 1 } }
    expect(marketLimitPrice(edges, true)).toBe('0.99999')
    expect(marketLimitPrice(edges, false)).toBe('0.00001')
  })

  it('has no price without an opposite side', () => {
    expect(marketLimitPrice({ ...DEEP, bestAsk: null, asks: [] }, true)).toBeNull()
    expect(marketLimitPrice({ ...DEEP, bestBid: null, bids: [] }, false)).toBeNull()
  })

  it('estimates the fill by walking the book up to the limit', () => {
    expect(estimateFill(DEEP, true, 25, 0.75526)).toEqual({ filled: 25, averagePx: (22 * 0.70526 + 3 * 0.72) / 25 })
    expect(estimateFill(DEEP, true, 50, 0.75526).filled).toBe(32)  // 0.8 is past the limit
    expect(estimateFill(DEEP, false, 35, 0.50263)).toEqual({ filled: 30, averagePx: 0.55263 })
    expect(estimateFill({ ...DEEP, asks: [] }, true, 5, 0.9)).toEqual({ filled: 0, averagePx: null })
  })

  it('builds an IOC limit at the worst price and explains it', () => {
    const check = checkTicket(MARKET_BUY, DEEP, FUNDS)
    expect(check.errors).toEqual([])
    expect(check.price).toBe('0.75526')
    expect(check.notional).toBeCloseTo(25 * 0.75526)  // funds checked at the worst price
    expect(check.action).toEqual({
      type: 'order',
      orders: [{ a: 100_102_190, b: true, p: '0.75526', s: '25', r: false, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na',
    })
    expect(check.notes[0]).toMatch(/Market buy: an IOC limit at 0.75526 \(best ask 0.70526 \+ 0.05\)/)
    expect(check.notes[1]).toMatch(/offers 25 of 25 contracts by that price, at an average of about 0.70703/)
  })

  it('ignores the price box and the TIF for a market order', () => {
    const check = checkTicket({ ...MARKET_BUY, price: 'junk', tif: 'Gtc' }, DEEP, FUNDS)
    expect(check.errors).toEqual([])
    expect(check.action?.orders[0].t).toEqual({ limit: { tif: 'Ioc' } })
  })

  it('warns about the part the book cannot fill', () => {
    const notes = checkTicket({ ...MARKET_BUY, size: '50' }, DEEP, FUNDS).notes
    expect(notes).toContain('18 contracts are not offered by 0.75526: unless the book changes, they would be canceled.')
  })

  it('sells only contracts held, priced from the bids', () => {
    const sell: TicketInput = { ...MARKET_BUY, isBuy: false, size: '30' }
    expect(checkTicket(sell, DEEP, FUNDS).errors[0]).toMatch(/You hold 0 contracts/)
    const check = checkTicket(sell, DEEP, { ...FUNDS, heldContracts: 30 })
    expect(check.errors).toEqual([])
    expect(check.action?.orders[0]).toMatchObject({ b: false, p: '0.50263', s: '30' })
  })

  it('blocks when the book is unknown or the opposite side is empty', () => {
    expect(checkTicket(MARKET_BUY, null, FUNDS).errors).toEqual(['Waiting for the book: a market order is priced from it.'])
    expect(checkTicket(MARKET_BUY, { ...DEEP, bestAsk: null, asks: [] }, FUNDS).errors[0]).toMatch(/No asks to buy from/)
  })

  it('applies the 1 USDC minimum at the worst price', () => {
    const tiny = { ...DEEP, bestBid: { px: 0.3, sz: 10 }, bids: [{ px: 0.3, sz: 10 }] }
    const sell: TicketInput = { ...MARKET_BUY, isBuy: false, size: '4' }  // 4 x 0.25 = 1.00: allowed
    expect(checkTicket(sell, tiny, { ...FUNDS, heldContracts: 4 }).errors).toEqual([])
    expect(checkTicket({ ...sell, size: '3' }, tiny, { ...FUNDS, heldContracts: 3 }).errors[0])
      .toMatch(/at least 1 USDC .*this one is 0.75 at its worst price 0.25/)
  })
})
