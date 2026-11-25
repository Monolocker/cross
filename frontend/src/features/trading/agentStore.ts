import { privateKeyToAccount } from 'viem/accounts'
import type { Network } from './client'

// Where the agent key lives (Milestone 27.4, decision: sessionStorage).
// sessionStorage belongs to this tab: it survives a reload and is gone
// when the tab closes. The key can only sign trades for your account,
// never withdraw, and any script running on this page could use it while
// it exists, so a short life is the point.

export interface StoredAgent {
  privateKey: `0x${string}`
  address: `0x${string}`  // lowercased
  name: string
  approvedAt: number  // ms
  validUntil: number // ms; Hyperliquid drops the approval after this 
}

const PRIVATE_KEY = /^0x[0-9a-f]{64}$/

// One key per network and account, so switching account in the wallet
// never signs with another account's agent.
function storageKey(network: Network, master: string): string {
  return `cross.agent.${network.name.toLowerCase()}.${master.toLowerCase()}`
}

export function readAgent(network: Network, master: string): StoredAgent | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(network, master))
    if (raw === null) {
      return null
    }
    const stored = JSON.parse(raw) as Partial<StoredAgent>
    if (typeof stored.privateKey !== 'string' || !PRIVATE_KEY.test(stored.privateKey)) {
      return null
    }
    // The address is derived from the key, never trusted from storage.
    const address = privateKeyToAccount(stored.privateKey).address.toLowerCase() as `0x${string}`
    if (stored.address !== address || typeof stored.name !== 'string' || typeof stored.approvedAt !== 'number') {
      return null
    }
    // An expired approval signs nothing Hyperliquid accepts: treat it as
    // gone (keys saved before 28.0 have no expiry and are also dropped).
    if (typeof stored.validUntil !== 'number' || stored.validUntil <= Date.now()) {
        return null
      }
      return {
        privateKey: stored.privateKey,
        address,
        name: stored.name,
        approvedAt: stored.approvedAt,
        validUntil: stored.validUntil,
      }
  } catch {
    return null  // blocked storage or bad JSON: as if there were no key
  }
}

export function writeAgent(network: Network, master: string, agent: StoredAgent): boolean {
  try {
    window.sessionStorage.setItem(storageKey(network, master), JSON.stringify(agent))
    return true
  } catch {
    return false
  }
}

export function removeAgent(network: Network, master: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(network, master))
  } catch {
    // Nothing stored, nothing to remove.
  }
}