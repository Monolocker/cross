import { toWire } from './wire'

// Action shapes for the exchange endpoint (Milestone 27.3), following
// the official docs' "Exchange endpoint" page and the official Python
// SDK's builders field for field.
//
// KEY ORDER MATTERS. L1 actions are hashed as msgpack, which writes an
// object's keys in insertion order. The SDK builds an order as a, b, p,
// s, r, t, c and the action as type, orders, grouping; any other order
// hashes differently, the signature recovers a different address, and
// Hyperliquid answers "User or API Wallet ... does not exist".

export type Tif = 'Alo' | 'Ioc' | 'Gtc'

export interface OrderWire {
  a: number  // asset id
  b: boolean  // is buy
  p: string  // limit price, wire form
  s: string  // size, wire form
  r: boolean  // reduce only
  t: { limit: { tif: Tif } }
  c?: string  // client order id: 0x + 32 hex digits
}

export interface OrderAction {
  type: 'order'
  orders: OrderWire[]
  grouping: 'na'
}

export interface CancelAction {
  type: 'cancel'
  cancels: { a: number; o: number }[]
}

export type L1Action = OrderAction | CancelAction

export interface LimitOrderInput {
  asset: number
  isBuy: boolean
  price: string
  size: string
  tif: Tif
  reduceOnly?: boolean
  cloid?: string
}

const CLOID = /^0x[0-9a-fA-F]{32}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function limitOrder(input: LimitOrderInput): OrderWire {
  const order: OrderWire = {
    a: input.asset,
    b: input.isBuy,
    p: toWire(input.price),
    s: toWire(input.size),
    r: input.reduceOnly ?? false,
    t: { limit: { tif: input.tif } },
  }
  if (input.cloid !== undefined) {
    if (!CLOID.test(input.cloid)) {
      throw new Error(`A cloid is 0x + 32 hex digits: "${input.cloid}"`)
    }
    order.c = input.cloid  // added last, as in the SDK
  }
  return order
}

export function orderAction(orders: OrderWire[]): OrderAction {
  return { type: 'order', orders, grouping: 'na' }
}

export function cancelAction(cancels: { asset: number; oid: number }[]): CancelAction {
  return { type: 'cancel', cancels: cancels.map(({ asset, oid }) => ({ a: asset, o: oid })) }
}

// approveAgent is a USER-signed action: the main wallet signs it as
// EIP-712 typed data whose fields are named in the types list, so key
// order does not matter here. signatureChainId is the chain the wallet
// signs on (hex); hyperliquidChain picks mainnet or testnet, which stops
// a testnet approval being replayed on mainnet.
export interface ApproveAgentAction {
  type: 'approveAgent'
  hyperliquidChain: 'Mainnet' | 'Testnet'
  signatureChainId: `0x${string}`
  agentAddress: `0x${string}`
  agentName: string
  nonce: number
}

export function approveAgentAction(input: {
  agentAddress: string
  isMainnet: boolean
  signatureChainId: number
  nonce: number
  agentName?: string
}): ApproveAgentAction {
  if (!ADDRESS.test(input.agentAddress)) {
    throw new Error(`Not an address: "${input.agentAddress}"`)
  }
  return {
    type: 'approveAgent',
    hyperliquidChain: input.isMainnet ? 'Mainnet' : 'Testnet',
    signatureChainId: `0x${input.signatureChainId.toString(16)}`,
    agentAddress: input.agentAddress.toLowerCase() as `0x${string}`,
    agentName: input.agentName ?? '',
    nonce: input.nonce,
  }
}

// What is POSTED for an approval. The SDK signs an unnamed approval
// with agentName "" but leaves agentName out of the request body.
export function postedApproveAgent(action: ApproveAgentAction): Omit<ApproveAgentAction, 'agentName'> & { agentName?: string } {
  if (action.agentName !== '') {
    return action
  }
  const { agentName: _unnamed, ...rest } = action
  return rest
}