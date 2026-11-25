import { readAgent } from '../features/trading/agentStore'
import type { Network } from '../features/trading/client'
import { useTestnetOutcomes } from '../features/trading/queries'
import OrderTicket from './OrderTicket'
import { OrderHistory, TradeHistory } from './TradeHistory'

interface AccountPageProps {
  network: Network
  master: string | null  // the connected wallet; null when none
  onOpenSettings: () => void
}

// Milestone 29.0: the Active positions page. Positions and open orders
// come with the order ticket (Close fills it), then trade and order
// history. Everything here is on testnet until mainnet trading (28.x).
function AccountPage({ network, master, onOpenSettings }: AccountPageProps) {
  const outcomes = useTestnetOutcomes()

  if (master === null) {
    return (
      <section className="page-panel">
        <h2>Active positions</h2>
        <p>Connect a wallet to see your positions, open orders, trades and order history.</p>
      </section>
    )
  }
  // Read on each render: the key lives in this tab's sessionStorage and
  // is approved or forgotten on the Settings page.
  const hasKey = readAgent(network, master) !== null
  return (
    <section className="page-panel account-page">
      <div className="page-heading">
        <h2>Active positions</h2>
        <span className="trading-key-network">{network.name}</span>
      </div>
      {!hasKey && (
        <p className="account-key-note">
          No trading key in this tab: you can see everything, but placing, closing or canceling needs one.{' '}
          <button type="button" onClick={onOpenSettings}>Approve one in Settings</button>
        </p>
      )}
      <OrderTicket key={`order-ticket:${master}`} network={network} master={master} />
      <TradeHistory network={network} master={master} outcomes={outcomes.data} />
      <OrderHistory network={network} master={master} outcomes={outcomes.data} />
    </section>
  )
}

export default AccountPage
