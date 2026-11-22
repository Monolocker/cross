import { encode } from '@msgpack/msgpack'
import { concat, hexToBytes, keccak256, parseSignature, toHex, type Hex, type LocalAccount } from 'viem'
import type { ApproveAgentAction, L1Action } from './actions'

// Hyperliquid's two signing schemes (Milestone 27.3), ported from the
// official Python SDK (hyperliquid/utils/signing.py) and checked
// against its own test vectors in signing.test.ts.
//
// 1. L1 actions (orders, cancels): msgpack(action) + nonce (+ vault,
//    + expiresAfter) is hashed with keccak256. That hash is signed as
//    EIP-712 typed data for a "phantom agent", under the fixed domain
//    "Exchange", chain id 1337. An agent wallet signs these.
// 2. User-signed actions (approveAgent, transfers, withdrawals): the
//    action's fields themselves are the typed data, under the domain
//    "HyperliquidSignTransaction" and the chain the wallet signs on.
//    Only the main wallet can sign these.

export interface Signature {
  r: Hex
  s: Hex
  v: number
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function uint64Bytes(value: number): Uint8Array {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value))
  return bytes
}

// action_hash in the SDK, byte for byte. Takes any object so the SDK's
// own test actions (e.g. {"type": "dummy"}) can be checked too.
export function actionHash(
  action: object,
  nonce: number,
  vaultAddress: string | null = null,
  expiresAfter: number | null = null,
): Hex {
  const parts: Uint8Array[] = [encode(action, { ignoreUndefined: true }), uint64Bytes(nonce)]
  if (vaultAddress === null) {
    parts.push(new Uint8Array([0]))
  } else {
    parts.push(new Uint8Array([1]), hexToBytes(vaultAddress.toLowerCase() as Hex))
  }
  if (expiresAfter !== null) {
    parts.push(new Uint8Array([0]), uint64Bytes(expiresAfter))
  }
  return keccak256(concat(parts))
}

// The typed data an agent signs for an L1 action. source "a" is
// mainnet, "b" testnet, so a testnet signature is useless on mainnet.
export function l1TypedData(hash: Hex, isMainnet: boolean) {
  return {
    domain: { name: 'Exchange', version: '1', chainId: 1337, verifyingContract: ZERO_ADDRESS },
    types: {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: { source: isMainnet ? 'a' : 'b', connectionId: hash },
  } as const
}

// The typed data the MAIN wallet signs to approve an agent (27.4 sends
// it to the wallet with eth_signTypedData_v4).
export function approveAgentTypedData(action: ApproveAgentAction) {
  return {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: Number.parseInt(action.signatureChainId, 16),
      verifyingContract: ZERO_ADDRESS,
    },
    types: {
      'HyperliquidTransaction:ApproveAgent': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'agentAddress', type: 'address' },
        { name: 'agentName', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    message: {
      hyperliquidChain: action.hyperliquidChain,
      agentAddress: action.agentAddress,
      agentName: action.agentName,
      nonce: BigInt(action.nonce),
    },
  } as const
}

// A 65-byte signature (r, s, v) in the SDK's form: r and s as hex
// numbers WITHOUT leading zeros (eth_utils.to_hex of an int), v 27/28.
export function splitSignature(signature: Hex): Signature {
  const { r, s, v } = parseSignature(signature)
  if (v === undefined) {
    throw new Error('Signature has no v')
  }
  return { r: toHex(BigInt(r)), s: toHex(BigInt(s)), v: Number(v) }
}

export async function signL1Action(
  agent: LocalAccount,
  action: L1Action,
  nonce: number,
  isMainnet: boolean,
  expiresAfter: number | null = null,
): Promise<Signature> {
  const hash = actionHash(action, nonce, null, expiresAfter)
  return splitSignature(await agent.signTypedData(l1TypedData(hash, isMainnet)))
}

// The request body for POST /exchange, shaped as the SDK's _post_action
// sends it (vaultAddress and expiresAfter present, null when unused).
export function exchangeBody(action: object, nonce: number, signature: Signature, expiresAfter: number | null = null) {
  return { action, nonce, signature, vaultAddress: null, expiresAfter }
}