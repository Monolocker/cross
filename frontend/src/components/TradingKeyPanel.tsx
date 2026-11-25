import type { Network } from '../features/trading/client'
import { useTradingKey } from '../features/trading/useTradingKey'
import type { Eip1193Provider } from '../features/wallet/eip1193'
import { shortAddress } from '../utils/format'

interface TradingKeyPanelProps {
  network: Network
  provider: Eip1193Provider
  master: string
  chainId: number | null
}

// Milestone 27.4: approve a trading key (an agent wallet) on testnet.
// Your wallet signs ONE approval; after that the key signs trades in
// this tab. It cannot withdraw or transfer funds.
// Render it with key={master}: a different account remounts it, so its
// state starts from that account's own stored key.
function TradingKeyPanel({ network, provider, master, chainId }: TradingKeyPanelProps) {
  const tradingKey = useTradingKey({ network, provider, master, chainId })
  const { agent, pendingAddress, status, message, error } = tradingKey
  const busy = status !== 'idle'

  return (
    <section className="trading-key" aria-label="Trading key">
      <div className="trading-key-heading">
        <strong>Trading key</strong>
        <span className="trading-key-network">{network.name}</span>
      </div>

      {agent === null ? (
        <>
          <p className="trading-key-note">
            Trading uses a key created in this tab and approved once by your wallet. It can place and cancel
            orders for your account, never withdraw. It is forgotten when this tab closes.
          </p>
          <button type="button" disabled={busy} onClick={tradingKey.approve}>
            Approve trading key
          </button>
        </>
      ) : (
        <>
          <p className="trading-key-note">
            Key <code title={agent.address}>{shortAddress(agent.address)}</code>, named “{agent.name}”, approved{' '}
            {new Date(agent.approvedAt).toLocaleTimeString()}, expires {new Date(agent.validUntil).toLocaleString()}.
          </p>
          <div className="trading-key-actions">
            <button type="button" disabled={busy} onClick={tradingKey.check}>
              Check on {network.name}
            </button>
            <button type="button" disabled={busy} onClick={tradingKey.test}>
              Test with a harmless cancel
            </button>
            <button type="button" className="wallet-secondary" disabled={busy} onClick={tradingKey.forget}>
              Forget key
            </button>
          </div>
        </>
      )}

      {status === 'approving' && pendingAddress !== null && (
        <p className="trading-key-pending" role="status">
          Your wallet will ask you to sign <code>HyperliquidTransaction:ApproveAgent</code>. Check that it shows
          hyperliquidChain <code>{network.name}</code>, agentName <code>cross valid_until …</code> (expiry in 24
            hours) and agentAddress <code>{pendingAddress}</code>.
        </p>
      )}
      {(status === 'checking' || status === 'testing') && (
        <p className="trading-key-pending" role="status">Asking {network.name}…</p>
      )}
      {message !== null && <p className="trading-key-message" role="status">{message}</p>}
      {error !== null && <p className="wallet-error trading-key-error" role="alert">{error}</p>}
    </section>
  )
}

export default TradingKeyPanel