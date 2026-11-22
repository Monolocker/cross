// Talking to Hyperliquid from the browser (Milestone 27.4). The 27.1
// probe showed /info and /exchange both allow any origin, so signed
// actions go straight from this page to Hyperliquid: our backend never
// sees a key, a signature or an order.

export interface Network {
    name: 'Mainnet' | 'Testnet'
    isMainnet: boolean
    apiUrl: string
  }
  
  export const TESTNET: Network = {
    name: 'Testnet',
    isMainnet: false,
    apiUrl: 'https://api.hyperliquid-testnet.xyz',
  }
  
  // Hyperliquid answers 200 for most failures: {"status": "err",
  // "response": "<reason>"}. Those become an ExchangeError with the reason.
  export class ExchangeError extends Error {}
  
  export interface ExchangeOk {
    status: 'ok'
    response: { type: string; data?: unknown }
  }
  
  async function post(network: Network, path: '/info' | '/exchange', body: object): Promise<unknown> {
    const response = await fetch(network.apiUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new ExchangeError(`${network.name} ${path} answered HTTP ${response.status}`)
    }
    return response.json()
  }
  
  export async function postInfo(network: Network, body: object): Promise<unknown> {
    return post(network, '/info', body)
  }
  
  export async function postExchange(network: Network, body: object): Promise<ExchangeOk> {
    const result = (await post(network, '/exchange', body)) as { status?: unknown; response?: unknown }
    if (result.status !== 'ok') {
      const reason = typeof result.response === 'string' ? result.response : JSON.stringify(result)
      throw new ExchangeError(reason)
    }
    return result as ExchangeOk
  }
  
  // Nonces are millisecond timestamps (docs: "Nonces and API wallets").
  // Two actions in the same millisecond would collide, so each new nonce
  // is at least one more than the last.
  let lastNonce = 0
  
  export function nextNonce(): number {
    lastNonce = Math.max(Date.now(), lastNonce + 1)
    return lastNonce
  }