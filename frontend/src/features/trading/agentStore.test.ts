import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAgent, removeAgent, writeAgent, type StoredAgent } from './agentStore'
import { TESTNET, type Network } from './client'

// Milestone 27.4: the agent key's storage, with an in-memory stand-in
// for the browser's sessionStorage.
const MAINNET: Network = { name: 'Mainnet', isMainnet: true, apiUrl: 'https://api.hyperliquid.xyz' }
const ALICE = '0x14791697260e4c9a71f18484c9f997b308e59325'
const BOB = '0x1111111111111111111111111111111111111111'
const AGENT: StoredAgent = {
  privateKey: `0x${'11'.repeat(32)}`,
  address: '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a',
  name: 'cross',
  approvedAt: 1763500000000,
}

let store: Map<string, string>

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('agent storage', () => {
  it('round-trips a key for one account on one network', () => {
    expect(writeAgent(TESTNET, ALICE, AGENT)).toBe(true)
    expect(readAgent(TESTNET, ALICE)).toEqual(AGENT)
    expect([...store.keys()]).toEqual([`cross.agent.testnet.${ALICE}`])
  })

  it('keeps accounts and networks apart', () => {
    writeAgent(TESTNET, ALICE, AGENT)
    expect(readAgent(TESTNET, BOB)).toBeNull()
    expect(readAgent(MAINNET, ALICE)).toBeNull()
  })

  it('finds the key whatever the address case', () => {
    writeAgent(TESTNET, ALICE.toUpperCase().replace('0X', '0x'), AGENT)
    expect(readAgent(TESTNET, ALICE)).toEqual(AGENT)
  })

  it('derives the address from the key and rejects a mismatch', () => {
    store.set(`cross.agent.testnet.${ALICE}`, JSON.stringify({ ...AGENT, address: BOB }))
    expect(readAgent(TESTNET, ALICE)).toBeNull()
  })

  it('treats bad JSON, a bad key or blocked storage as no key', () => {
    store.set(`cross.agent.testnet.${ALICE}`, '{not json')
    expect(readAgent(TESTNET, ALICE)).toBeNull()
    store.set(`cross.agent.testnet.${ALICE}`, JSON.stringify({ ...AGENT, privateKey: '0x1234' }))
    expect(readAgent(TESTNET, ALICE)).toBeNull()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => { throw new Error('blocked') },
        setItem: () => { throw new Error('blocked') },
        removeItem: () => { throw new Error('blocked') },
      },
    })
    expect(readAgent(TESTNET, ALICE)).toBeNull()
    expect(writeAgent(TESTNET, ALICE, AGENT)).toBe(false)
    expect(() => removeAgent(TESTNET, ALICE)).not.toThrow()
  })

  it('removes the key', () => {
    writeAgent(TESTNET, ALICE, AGENT)
    removeAgent(TESTNET, ALICE)
    expect(readAgent(TESTNET, ALICE)).toBeNull()
  })
})