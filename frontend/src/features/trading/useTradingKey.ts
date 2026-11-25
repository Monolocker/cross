import { useCallback, useState } from 'react'
import type { Eip1193Provider } from '../wallet/eip1193'
import { walletErrorMessage } from '../wallet/eip1193'
import { agentMaster, approveAgent, listAgents, testAgentWithCancel } from './agent'
import { readAgent, removeAgent, writeAgent, type StoredAgent } from './agentStore'
import type { Network } from './client'

export type KeyStatus = 'idle' | 'approving' | 'checking' | 'testing'

export interface TradingKeyState {
  agent: StoredAgent | null
  pendingAddress: string | null  // the agent the wallet is being asked to approve
  status: KeyStatus
  message: string | null
  error: string | null
  approve: () => void
  check: () => void
  test: () => void
  forget: () => void
}

interface TradingKeyInput {
  network: Network
  provider: Eip1193Provider
  master: string  // lowercased connected address
  chainId: number | null
}

// The trading key for ONE account on one network (27.4). The component
// using this is keyed by the account, so switching account in the wallet
// starts fresh with that account's own stored key.
export function useTradingKey({ network, provider, master, chainId }: TradingKeyInput): TradingKeyState {
  const [agent, setAgent] = useState<StoredAgent | null>(() => readAgent(network, master))
  const [pendingAddress, setPendingAddress] = useState<string | null>(null)
  const [status, setStatus] = useState<KeyStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback((next: KeyStatus, work: () => Promise<void>) => {
    setStatus(next)
    setMessage(null)
    setError(null)
    void work()
      .catch((exc: unknown) => setError(walletErrorMessage(exc)))
      .finally(() => {
        setStatus('idle')
        setPendingAddress(null)
      })
  }, [])

  const approve = useCallback(() => {
    if (chainId === null) {
      setError('Your wallet did not report its chain. Reconnect it and try again.')
      return
    }
    run('approving', async () => {
      const approved = await approveAgent({
        network, provider, master, chainId,
        onAgentCreated: setPendingAddress,
      })
      if (!writeAgent(network, master, approved)) {
        throw new Error('Approved, but this browser blocked storing the key. Allow storage, then approve again.')
      }
      setAgent(approved)
      setMessage(`Approved on ${network.name}.`)
    })
  }, [network, provider, master, chainId, run])

  const check = useCallback(() => {
    if (agent === null) {
      return
    }
    run('checking', async () => {
      const approvedFor = await agentMaster(network, agent.address)
      if (approvedFor === master) {
        // Also list every named agent exactly as Hyperliquid stores it:
        // the 28.0 test of whether "cross valid_until ..." still counts
        // as the name "cross" (one entry after re-approving = it does).
        const agents = await listAgents(network, master)
        const listed = agents
          .map((item) => `"${item.name}" ${item.address}${item.address === agent.address ? ' (this key)' : ''}`
            + (item.validUntil === null ? '' : `, expires ${new Date(item.validUntil).toLocaleString()}`))
          .join('; ')
        setMessage(`${network.name} confirms this key trades for your account. `
          + `Named agents: ${agents.length}${listed === '' ? '' : ` (${listed})`}.`)
      } else {
        throw new Error(approvedFor === null
          ? `${network.name} does not know this key as an agent (replaced or expired). Approve a new one.`
          : `${network.name} has this key working for ${approvedFor}, not your account.`)
      }
    })
  }, [network, agent, master, run])

  const test = useCallback(() => {
    if (agent === null) {
      return
    }
    run('testing', async () => {
      setMessage(await testAgentWithCancel(network, agent))
    })
  }, [network, agent, run])

  // Forget the key in this tab. Hyperliquid still lists it as approved
  // until the next "cross" approval replaces it, but without the key
  // nothing can sign with it.
  const forget = useCallback(() => {
    removeAgent(network, master)
    setAgent(null)
    setMessage('Key forgotten in this tab.')
    setError(null)
  }, [network, master])

  return { agent, pendingAddress, status, message, error, approve, check, test, forget }
}