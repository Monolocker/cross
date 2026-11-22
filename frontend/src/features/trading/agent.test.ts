import { getTypesForEIP712Domain, recoverTypedDataAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Eip1193Provider } from '../wallet/eip1193'

// Milestone 27.4: agent approval and checks, with a fake wallet and a
// fake network (nothing here reaches Hyperliquid). The expected
// signature for the named "cross" approval was produced by the official
// Python SDK (commit 2fdb18f, sign_inner + user_signed_payload) with the
// same key, agent, chain (0xa4b1) and nonce.
const TEST_KEY = '0x0123456789012345678901234567890123456789012345678901234567890123'
const AGENT_KEY: Hex = `0x${'11'.repeat(32)}`
const wallet = privateKeyToAccount(TEST_KEY)
const MASTER = wallet.address.toLowerCase()
const AGENT = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'
const NONCE = 1763500000000
const SDK_SIGNATURE = {
  r: '0xb1f61b8fbd486e79de45d625f9575b6d21b9587470635f8c09abe8c91a9f4d76',
  s: '0x1b6a82e00bc592cadcdd09cb589b06770ec36c3ce439d55607b92e38708cff8f',
  v: 27,
}

// A wallet that signs eth_signTypedData_v4 with the test key, the way a
// browser wallet would: from the JSON it is given.
function fakeWallet(signer = wallet) {
  const received: { method: string; params?: unknown[] }[] = []
  const provider: Eip1193Provider = {
    request: async (args) => {
      received.push(args)
      if (args.method !== 'eth_signTypedData_v4') {
        throw { code: 4200, message: 'unsupported' }
      }
      const data = JSON.parse((args.params as string[])[1])
      const { EIP712Domain: _domainType, ...types } = data.types
      return signer.signTypedData({
        domain: data.domain,
        types,
        primaryType: data.primaryType,
        message: { ...data.message, nonce: BigInt(data.message.nonce) },
      })
    },
  }
  return { provider, received }
}

function fakeFetch(answer: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { ok: status === 200, status, json: async () => answer }
  }))
  return calls
}

// Fresh modules per test, so the nonce counter starts from the clock.
async function load() {
  vi.resetModules()
  const agent = await import('./agent')
  const client = await import('./client')
  const signing = await import('./signing')
  return { ...agent, ...client, ...signing }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NONCE)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('approveAgent', () => {
  it('signs exactly what the SDK signs and posts the SDK request body', async () => {
    const { approveAgent, TESTNET } = await load()
    const { provider, received } = fakeWallet()
    const calls = fakeFetch({ status: 'ok', response: { type: 'default' } })
    const shown: string[] = []

    const stored = await approveAgent({
      network: TESTNET, provider, master: MASTER, chainId: 42161,
      onAgentCreated: (address) => shown.push(address), newKey: () => AGENT_KEY,
    })

    expect(shown).toEqual([AGENT])  // shown BEFORE the wallet prompt
    expect(received[0].method).toBe('eth_signTypedData_v4')
    expect((received[0].params as string[])[0]).toBe(MASTER)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.hyperliquid-testnet.xyz/exchange')
    expect(calls[0].body).toEqual({
      action: {
        type: 'approveAgent',
        hyperliquidChain: 'Testnet',
        signatureChainId: '0xa4b1',
        agentAddress: AGENT,
        agentName: 'cross',
        nonce: NONCE,
      },
      nonce: NONCE,
      signature: SDK_SIGNATURE,
      vaultAddress: null,
      expiresAfter: null,
    })
    expect(stored).toEqual({ privateKey: AGENT_KEY, address: AGENT, name: 'cross', approvedAt: NONCE })
  })

  it('gives the wallet standard EIP-712 JSON (domain type spelled out, nonce as a string)', async () => {
    const { approveAgent, TESTNET } = await load()
    const { provider, received } = fakeWallet()
    fakeFetch({ status: 'ok', response: { type: 'default' } })
    await approveAgent({ network: TESTNET, provider, master: MASTER, chainId: 42161, newKey: () => AGENT_KEY })
    const data = JSON.parse((received[0].params as string[])[1])
    expect(data.types.EIP712Domain).toEqual(getTypesForEIP712Domain({ domain: data.domain }))
    expect(data.message.nonce).toBe(String(NONCE))
    expect(data.domain.chainId).toBe(42161)
  })

  it('sends nothing if the wallet signs as another account', async () => {
    const { approveAgent, TESTNET } = await load()
    const other = privateKeyToAccount(`0x${'22'.repeat(32)}`)
    const { provider } = fakeWallet(other)
    const calls = fakeFetch({ status: 'ok', response: { type: 'default' } })
    await expect(approveAgent({ network: TESTNET, provider, master: MASTER, chainId: 42161 }))
      .rejects.toThrow(/Nothing was sent/)
    expect(calls).toHaveLength(0)
  })

  it('passes a wallet rejection through untouched', async () => {
    const { approveAgent, TESTNET } = await load()
    const provider: Eip1193Provider = { request: async () => { throw { code: 4001, message: 'User rejected' } } }
    const calls = fakeFetch({})
    await expect(approveAgent({ network: TESTNET, provider, master: MASTER, chainId: 42161 }))
      .rejects.toMatchObject({ code: 4001 })
    expect(calls).toHaveLength(0)
  })

  it('fails with Hyperliquid\'s reason when the approval is refused', async () => {
    const { approveAgent, ExchangeError, TESTNET } = await load()
    const { provider } = fakeWallet()
    fakeFetch({ status: 'err', response: 'Must deposit before performing actions. User: 0x...' })
    const attempt = approveAgent({ network: TESTNET, provider, master: MASTER, chainId: 42161 })
    await expect(attempt).rejects.toBeInstanceOf(ExchangeError)
    await expect(attempt).rejects.toThrow('Must deposit before performing actions')
  })

  it('draws a different random key every time', async () => {
    const { approveAgent, TESTNET } = await load()
    const { provider } = fakeWallet()
    fakeFetch({ status: 'ok', response: { type: 'default' } })
    const first = await approveAgent({ network: TESTNET, provider, master: MASTER, chainId: 42161 })
    const second = await approveAgent({ network: TESTNET, provider, master: MASTER, chainId: 42161 })
    expect(first.privateKey).not.toBe(second.privateKey)
    expect(first.address).not.toBe(second.address)
  })
})

describe('agent checks', () => {
  it('reads the master from userRole', async () => {
    const { agentMaster, TESTNET } = await load()
    const calls = fakeFetch({ role: 'agent', data: { user: wallet.address } })
    expect(await agentMaster(TESTNET, AGENT)).toBe(MASTER)
    expect(calls[0]).toEqual({ url: 'https://api.hyperliquid-testnet.xyz/info', body: { type: 'userRole', user: AGENT } })
    fakeFetch({ role: 'missing' })
    expect(await agentMaster(TESTNET, AGENT)).toBeNull()
  })

  it('tests the key with a cancel signed by the agent', async () => {
    const { actionHash, l1TypedData, testAgentWithCancel, TESTNET } = await load()
    const calls = fakeFetch({
      status: 'ok',
      response: { type: 'cancel', data: { statuses: [{ error: 'Order was never placed, already canceled, or filled.' }] } },
    })
    const agent = { privateKey: AGENT_KEY, address: AGENT as `0x${string}`, name: 'cross', approvedAt: 0 }
    expect(await testAgentWithCancel(TESTNET, agent)).toMatch(/accepted the signature/)
    const body = calls[0].body as { action: object; nonce: number; signature: { r: Hex; s: Hex; v: number } }
    expect(body.action).toEqual({ type: 'cancel', cancels: [{ a: 0, o: 1 }] })
    const { r, s, v } = body.signature
    const signature = `0x${r.slice(2).padStart(64, '0')}${s.slice(2).padStart(64, '0')}${v.toString(16)}` as Hex
    const signer = await recoverTypedDataAddress({ ...l1TypedData(actionHash(body.action, body.nonce), false), signature })
    expect(signer.toLowerCase()).toBe(AGENT)  // signed by the agent, for testnet ("b")
  })

  it('reports an unrecognized key and unexpected answers', async () => {
    const { testAgentWithCancel, TESTNET } = await load()
    const agent = { privateKey: AGENT_KEY, address: AGENT as `0x${string}`, name: 'cross', approvedAt: 0 }
    fakeFetch({ status: 'err', response: `User or API Wallet ${AGENT} does not exist.` })
    await expect(testAgentWithCancel(TESTNET, agent)).rejects.toThrow('does not exist')
    fakeFetch({ status: 'ok', response: { type: 'cancel', data: { statuses: ['success'] } } })
    await expect(testAgentWithCancel(TESTNET, agent)).rejects.toThrow('Unexpected answer')
  })
})

describe('client', () => {
  it('never repeats a nonce, even within one millisecond', async () => {
    const { nextNonce } = await load()
    const nonces = [nextNonce(), nextNonce(), nextNonce()]
    expect(nonces).toEqual([NONCE, NONCE + 1, NONCE + 2])
  })

  it('turns an HTTP failure into an ExchangeError', async () => {
    const { ExchangeError, postInfo, TESTNET } = await load()
    fakeFetch({}, 500)
    await expect(postInfo(TESTNET, { type: 'userRole', user: AGENT })).rejects.toBeInstanceOf(ExchangeError)
  })
})