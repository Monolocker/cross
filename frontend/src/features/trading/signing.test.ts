import { encode } from '@msgpack/msgpack'
import { bytesToHex, recoverTypedDataAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { approveAgentAction, cancelAction, limitOrder, orderAction, postedApproveAgent } from './actions'
import { actionHash, approveAgentTypedData, l1TypedData, signL1Action, splitSignature } from './signing'
import { assetFromCoin, outcomeAsset, toWire } from './wire'

// Golden vectors (Milestone 27.3). Every expected value below comes from
// the official Python SDK, hyperliquid-dex/hyperliquid-python-sdk at
// commit 2fdb18f:
//   "SDK test" = copied from its tests/signing_test.py;
//   "SDK run"  = produced by running its signing functions on our
//                outcome-shaped actions (the script is in the 27.3 notes).
// The key is the SDK tests' public dummy key. It holds nothing and must
// never be used for anything real.
const TEST_KEY = '0x0123456789012345678901234567890123456789012345678901234567890123'
const wallet = privateKeyToAccount(TEST_KEY)
const NONCE = 1763500000000
const AGENT = '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a'

describe('wire format', () => {
  it('writes decimals in their shortest form, like float_to_wire', () => {
    expect(toWire('100')).toBe('100')
    expect(toWire('100.0')).toBe('100')
    expect(toWire('0.50')).toBe('0.5')
    expect(toWire('0.59233')).toBe('0.59233')
    expect(toWire('1670.1')).toBe('1670.1')
    expect(toWire('0.0')).toBe('0')
  })

  it('rejects anything that is not a plain decimal', () => {
    for (const bad of ['', '-1', '1e3', ' 1', '01', '.5', '1.', '0x10']) {
      expect(() => toWire(bad)).toThrow()
    }
  })

  it('derives outcome asset ids as the docs define them', () => {
    expect(outcomeAsset(1, 0)).toBe(100_000_010)  // the docs' own example
    expect(outcomeAsset(37286, 1)).toBe(100_372_861)
    expect(assetFromCoin('#10')).toBe(100_000_010)
    expect(assetFromCoin('#372861')).toBe(100_372_861)
    expect(() => assetFromCoin('#372862')).toThrow()  // side 2 does not exist
    expect(() => assetFromCoin('BTC')).toThrow()
  })
})

describe('L1 actions, SDK tests', () => {
  it('signer is the SDK test address', () => {
    expect(wallet.address.toLowerCase()).toBe('0x14791697260e4c9a71f18484c9f997b308e59325')
  })

  it('phantom agent hash matches production (test_phantom_agent_creation_matches_production)', () => {
    const action = orderAction([limitOrder({ asset: 4, isBuy: true, price: '1670.1', size: '0.0147', tif: 'Ioc' })])
    expect(actionHash(action, 1677777606040)).toBe('0x0fcbeda5ae3c4950a548021552a4fea2226858c4453571bf3f24ba017eac2908')
  })

  it('signs a dummy action (test_l1_action_signing_matches)', async () => {
    const action = { type: 'dummy', num: 100_000_000_000 }  // float_to_int_for_hashing(1000)
    const sign = async (isMainnet: boolean) =>
      splitSignature(await wallet.signTypedData(l1TypedData(actionHash(action, 0), isMainnet)))
    expect(await sign(true)).toEqual({
      r: '0x53749d5b30552aeb2fca34b530185976545bb22d0b3ce6f62e31be961a59298',
      s: '0x755c40ba9bf05223521753995abb2f73ab3229be8ec921f350cb447e384d8ed8',
      v: 27,
    })
    expect(await sign(false)).toEqual({
      r: '0x542af61ef1f429707e3c76c5293c80d01f74ef853e34b76efffcb57e574f9510',
      s: '0x17b8b32f086e8cdede991f1e2c529f5dd5297cbe8128500e00cbaf766204a613',
      v: 28,
    })
  })

  it('signs an order (test_l1_action_signing_order_matches)', async () => {
    const action = orderAction([limitOrder({ asset: 1, isBuy: true, price: '100', size: '100', tif: 'Gtc' })])
    expect(await signL1Action(wallet, action, 0, true)).toEqual({
      r: '0xd65369825a9df5d80099e513cce430311d7d26ddf477f5b3a33d2806b100d78e',
      s: '0x2b54116ff64054968aa237c20ca9ff68000f977c93289157748a3162b6ea940e',
      v: 28,
    })
    expect(await signL1Action(wallet, action, 0, false)).toEqual({
      r: '0x82b2ba28e76b3d761093aaded1b1cdad4960b3af30212b343fb2e6cdfa4e3d54',
      s: '0x6b53878fc99d26047f4d7e8c90eb98955a109f44209163f52d8dc4278cbbd9f5',
      v: 27,
    })
  })

  it('signs an order with a cloid (test_l1_action_signing_order_with_cloid_matches)', async () => {
    const action = orderAction([limitOrder({
      asset: 1, isBuy: true, price: '100', size: '100', tif: 'Gtc', cloid: '0x00000000000000000000000000000001',
    })])
    expect(await signL1Action(wallet, action, 0, true)).toEqual({
      r: '0x41ae18e8239a56cacbc5dad94d45d0b747e5da11ad564077fcac71277a946e3',
      s: '0x3c61f667e747404fe7eea8f90ab0e76cc12ce60270438b2058324681a00116da',
      v: 27,
    })
    expect(await signL1Action(wallet, action, 0, false)).toEqual({
      r: '0xeba0664bed2676fc4e5a743bf89e5c7501aa6d870bdb9446e122c9466c5cd16d',
      s: '0x7f3e74825c9114bc59086f1eebea2928c190fdfbfde144827cb02b85bbe90988',
      v: 28,
    })
  })

  it('hashes a vault address in (test_l1_action_signing_matches_with_vault)', async () => {
    const action = { type: 'dummy', num: 100_000_000_000 }
    const hash = actionHash(action, 0, '0x1719884eb866cb12b2287399b15f7db5e7d775ea')
    expect(splitSignature(await wallet.signTypedData(l1TypedData(hash, true)))).toEqual({
      r: '0x3c548db75e479f8012acf3000ca3a6b05606bc2ec0c29c50c515066a326239',
      s: '0x4d402be7396ce74fbba3795769cda45aec00dc3125a984f2a9f23177b190da2c',
      v: 28,
    })
  })

  it('signs a non-order action (test_create_sub_account_action)', async () => {
    const action = { type: 'createSubAccount', name: 'example' }
    expect(splitSignature(await wallet.signTypedData(l1TypedData(actionHash(action, 0), false)))).toEqual({
      r: '0xa699e3ed5c2b89628c746d3298b5dc1cca604694c2c855da8bb8250ec8014a5b',
      s: '0x53f1b8153a301c72ecc655b1c315d64e1dcea3ee58921fd7507e35818fcc1584',
      v: 28,
    })
  })
})

describe('outcome actions, SDK run', () => {
  const buy = orderAction([limitOrder({ asset: outcomeAsset(1, 0), isBuy: true, price: '0.59233', size: '2', tif: 'Gtc' })])

  it('encodes a buy exactly as Python msgpack does', () => {
    expect(bytesToHex(encode(buy))).toBe(
      '0x83a474797065a56f72646572a66f72646572739186a161ce05f5e10aa162c3a170a7302e3539323333a173a132a172c2a1748' +
      '1a56c696d697481a3746966a3477463a867726f7570696e67a26e61',
    )
    expect(actionHash(buy, NONCE)).toBe('0xfc10b66b33b6dce0b7ace2ba4698c9b69b5dfef07cf16f66fee5d9bddbbb6d09')
  })

  it('signs an outcome buy (Gtc) for both networks', async () => {
    expect(await signL1Action(wallet, buy, NONCE, true)).toEqual({
      r: '0x8b610d75067b7f5cae7d61e680a58e6906b3e2d71ff5bdf34e75cd7e9d705aea',
      s: '0x455a61e80b5ca4757eafee6385237fb54ff631f1cc94ba8fef879861f5feb263',
      v: 28,
    })
    expect(await signL1Action(wallet, buy, NONCE, false)).toEqual({
      r: '0x525397c16be2a0412b29015c9327eb7da4bf3924d9b351f77177aeb62aae5cb3',
      s: '0x7e41fc37eeee1e59a73b0722d89b410f4cd2e245bbc0e12810d1518d406cb655',
      v: 28,
    })
  })

  it('signs an Ioc sell of side 1 with a cloid and expiresAfter', async () => {
    const sell = orderAction([limitOrder({
      asset: assetFromCoin('#372861'), isBuy: false, price: '0.050', size: '150', tif: 'Ioc',
      cloid: '0x00000000000000000000000000000007',
    })])
    const expiresAfter = NONCE + 60_000
    expect(actionHash(sell, NONCE, null, expiresAfter)).toBe(
      '0x52479b17c5cd5bf641a57c42f9a2b18c9b6416f7c3ebb879f43818ac3c1aea43',
    )
    expect(await signL1Action(wallet, sell, NONCE, false, expiresAfter)).toEqual({
      r: '0x2d0fc4e39e8853e094a107a7583f4a358322cc155407500dbe78d50958454d7d',
      s: '0x3d133fdcc06e4536ff5421c9f8ec728b0b74f33864e753511923ec899faf8e73',
      v: 27,
    })
  })

  it('signs a cancel', async () => {
    const cancel = cancelAction([{ asset: 100_000_011, oid: 123456789 }])
    expect(actionHash(cancel, NONCE)).toBe('0x03dc7857c0cf2737710f8a2693c506a3fc934b7a663cd573edcefe2f5dcdbfaf')
    expect(await signL1Action(wallet, cancel, NONCE, false)).toEqual({
      r: '0x1efbed474f0f9d7358be51e3fe7ac7bc877ce51c83e704871b019576de87b01a',
      s: '0x41cc82f98dcef8bd170e3963c37c2ddfc960b6209352baac239931686b2c770',
      v: 27,
    })
  })

  it('changes the hash when key order changes (why actions.ts fixes it)', () => {
    const [order] = buy.orders
    const reordered = { type: 'order', orders: [{ b: order.b, a: order.a, p: order.p, s: order.s, r: order.r, t: order.t }], grouping: 'na' }
    expect(actionHash(reordered, NONCE)).not.toBe(actionHash(buy, NONCE))
  })
})

describe('approveAgent (user-signed), SDK run', () => {
  it('matches sign_agent as the SDK calls it (chain 0x66eee)', async () => {
    const action = approveAgentAction({ agentAddress: AGENT, isMainnet: false, signatureChainId: 0x66eee, nonce: NONCE })
    expect(splitSignature(await wallet.signTypedData(approveAgentTypedData(action)))).toEqual({
      r: '0x8b2e08f125113ca68334a4a208b263dde8446e44a5670be2b596b65e2b3d75b1',
      s: '0x733e0fcc198f10ce06e4eccacfc030c366f1d25eb66c323ce79ff6561501d2a5',
      v: 27,
    })
  })

  it('matches when signed on Arbitrum (0xa4b1), as a wallet on that chain would', async () => {
    const action = approveAgentAction({ agentAddress: AGENT, isMainnet: false, signatureChainId: 42161, nonce: NONCE })
    expect(action.signatureChainId).toBe('0xa4b1')
    const typedData = approveAgentTypedData(action)
    const signature = await wallet.signTypedData(typedData)
    expect(splitSignature(signature)).toEqual({
      r: '0x3d51e0309de82d38100886125f0fdf8e69fff64540ff1278e2efaa9c6563940b',
      s: '0x7abf9a4c132df8cde3de9520ff454a03ae048725fd95cd3b55abe7deaa66fa4e',
      v: 28,
    })
    // What Hyperliquid does on receipt: recover the signer from the data.
    expect((await recoverTypedDataAddress({ ...typedData, signature })).toLowerCase()).toBe(wallet.address.toLowerCase())
  })

  it('posts an unnamed approval without agentName, as the SDK does', () => {
    const action = approveAgentAction({ agentAddress: AGENT, isMainnet: false, signatureChainId: 42161, nonce: NONCE })
    expect('agentName' in postedApproveAgent(action)).toBe(false)
    const named = approveAgentAction({ agentAddress: AGENT, isMainnet: false, signatureChainId: 42161, nonce: NONCE, agentName: 'cross' })
    expect(postedApproveAgent(named).agentName).toBe('cross')
  })
})