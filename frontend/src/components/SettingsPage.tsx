import type { Network } from '../features/trading/client'
import type { WalletState } from '../features/wallet/useWallet'
import TradingKeyPanel from './TradingKeyPanel'

interface SettingsPageProps {
  network: Network
  wallet: WalletState
}

// Milestone 29.0: settings. For now, the trading key (approve, check,
// test, forget), moved here from the top of the page.
function SettingsPage({ network, wallet }: SettingsPageProps) {
  return (
    <section className="page-panel settings-page">
      <h2>Settings</h2>
      {wallet.address !== null && wallet.provider !== null ? (
        <TradingKeyPanel
          key={`trading-key:${wallet.address}`}
          network={network}
          provider={wallet.provider}
          master={wallet.address}
          chainId={wallet.chainId}
        />
      ) : (
        <p>Connect a wallet to manage your trading key.</p>
      )}
    </section>
  )
}

export default SettingsPage
