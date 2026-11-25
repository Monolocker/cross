import { recoverTypedDataAddress, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { Eip1193Provider } from '../wallet/eip1193'
import { approveAgentAction, cancelAction, postedApproveAgent } from './actions'
import type { StoredAgent } from './agentStore'
import { nextNonce, postExchange, postInfo, type Network } from './client'
import { approveAgentTypedData, exchangeBody, signL1Action, splitSignature } from './signing'

// Approving and checking an agent (Milestone 27.4).
//
// Named "cross": per the docs, approving with a matching name replaces
// our previous agent, while an UNNAMED approval would replace whatever
// unnamed agent another app uses on this account.
export const AGENT_NAME = 'cross'
// Approvals expire after 24 hours (decision 28, 4). The docs: "A custom
// expiration can be set by appending valid_until {timestamp} after the
// name", at most 180 days ahead. The timestamp is in ms, like the
// validUntil that extraAgents reports.
export const AGENT_TTL_MS = 24 * 60 * 60 * 1000

// The docs show this text alone; live testnet appends details
// (" asset=0"), so it matches as a prefix 
const NEVER_PLACED = 'Order was never placed, already canceled, or filled.'

// eth_signTypedData_v4 needs the domain's own type spelled out (viem
// derives it; a wallet does not).
const EIP712_DOMAIN = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
]

export interface ApproveRequest {
  network: Network
  provider: Eip1193Provider
  master: string  // the connected wallet address, lowercased
  chainId: number  // the wallet's current chain: it signs on this chain
  onAgentCreated?: (agentAddress: string) => void  // show it before the wallet prompt
  newKey?: () => Hex  // tests pass a fixed key; real use draws a random one
}

// 1. Draw a fresh random key in the browser (never reused: docs).
// 2. Ask the MAIN wallet to sign approveAgent (eth_signTypedData_v4).
// 3. Check the signature recovers the connected address BEFORE sending.
// 4. POST it to Hyperliquid. Only on "ok" is the key returned.
export async function approveAgent(request: ApproveRequest): Promise<StoredAgent> {
  const privateKey = (request.newKey ?? generatePrivateKey)()
  const agent = privateKeyToAccount(privateKey)
  const agentAddress = agent.address.toLowerCase() as `0x${string}`
  request.onAgentCreated?.(agentAddress)

  const nonce = nextNonce()
  const validUntil = nonce + AGENT_TTL_MS
  const action = approveAgentAction({
    agentAddress,
    isMainnet: request.network.isMainnet,
    signatureChainId: request.chainId,
    nonce,
    agentName: `${AGENT_NAME} valid_until ${validUntil}`,
  })
  const typedData = approveAgentTypedData(action)
  // A wallet takes typed data as JSON. The uint64 nonce is sent as a
  // decimal string: JSON.stringify cannot write a BigInt.
  const json = JSON.stringify({
    domain: typedData.domain,
    types: { EIP712Domain: EIP712_DOMAIN, ...typedData.types },
    primaryType: typedData.primaryType,
    message: { ...typedData.message, nonce: typedData.message.nonce.toString() },
  })
  const signature = (await request.provider.request({
    method: 'eth_signTypedData_v4',
    params: [request.master, json],
  })) as Hex

  // Hyperliquid would recover the signer exactly like this. If it is not
  // the connected account (wrong account selected in the wallet, or a
  // wallet that changed the data), stop here instead of sending.
  const signer = (await recoverTypedDataAddress({ ...typedData, signature })).toLowerCase()
  if (signer !== request.master.toLowerCase()) {
    throw new Error(`The wallet signed as ${signer}, not ${request.master}. Nothing was sent.`)
  }

  await postExchange(request.network, exchangeBody(postedApproveAgent(action), action.nonce, splitSignature(signature)))
  return { privateKey, address: agentAddress, name: AGENT_NAME, approvedAt: Date.now(), validUntil }
}

export interface ApprovedAgent {
  name: string
  address: string  // lowercased
  validUntil: number | null  // ms
}

// Every named agent approved for this account (info "extraAgents", as
// the official SDK's Info.extra_agents queries it).
export async function listAgents(network: Network, master: string): Promise<ApprovedAgent[]> {
  const raw = await postInfo(network, { type: 'extraAgents', user: master })
  const agents: ApprovedAgent[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    const agent = item as { name?: unknown; address?: unknown; validUntil?: unknown }
    if (typeof agent.address === 'string') {
      agents.push({
        name: typeof agent.name === 'string' ? agent.name : '',
        address: agent.address.toLowerCase(),
        validUntil: typeof agent.validUntil === 'number' ? agent.validUntil : null,
      })
    }
  }
  return agents
}

// Asks Hyperliquid who this agent works for (info "userRole"). Returns
// the master address it is approved for, or null if it is not an agent.
export async function agentMaster(network: Network, agentAddress: string): Promise<string | null> {
  const role = (await postInfo(network, { type: 'userRole', user: agentAddress })) as {
    role?: unknown
    data?: { user?: unknown }
  }
  return role.role === 'agent' && typeof role.data?.user === 'string' ? role.data.user.toLowerCase() : null
}

// A harmless end-to-end test of the agent: cancel order id 1 on asset 0,
// which cannot be ours. Hyperliquid only gets as far as "never placed"
// if the signature is valid AND the agent is approved for an account.
// A bad signature or an unapproved key fails earlier, with
// "User or API Wallet ... does not exist".
export async function testAgentWithCancel(network: Network, agent: StoredAgent): Promise<string> {
  const account = privateKeyToAccount(agent.privateKey)
  const action = cancelAction([{ asset: 0, oid: 1 }])
  const nonce = nextNonce()
  const signature = await signL1Action(account, action, nonce, network.isMainnet)
  const result = await postExchange(network, exchangeBody(action, nonce, signature))
  const statuses = (result.response.data as { statuses?: unknown[] } | undefined)?.statuses
  const first = statuses?.[0] as { error?: unknown } | string | undefined
  if (typeof first === 'object' && typeof first.error === 'string' && first.error.startsWith(NEVER_PLACED)) {
    return 'Hyperliquid accepted the signature and recognized the key. Nothing was canceled.'
  }
  throw new Error(`Unexpected answer: ${JSON.stringify(result.response)}`)
}
