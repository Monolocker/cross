import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { readAgent } from '../features/trading/agentStore'
import type { Network } from '../features/trading/client'
import { cancelOrder } from '../features/trading/orders'
import { refreshAfterTrade, useOpenOutcomeOrders } from '../features/trading/queries'
import type { TestnetOutcome } from '../features/trading/testnetMarkets'
import { walletErrorMessage } from '../features/wallet/eip1193'

interface OpenOrdersProps {
  network: Network
  master: string
  outcomes: TestnetOutcome[] | undefined  // for names; ids are shown regardless
}

// Milestone 27.6: your open outcome orders on testnet, each with Cancel.
function OpenOrders({ network, master, outcomes }: OpenOrdersProps) {
  const queryClient = useQueryClient()
  const orders = useOpenOutcomeOrders(network, master)
  const [busyOid, setBusyOid] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function describe(coin: string): string {
    const encoding = Number(coin.slice(1))
    const outcome = outcomes?.find((item) => item.id === Math.floor(encoding / 10))
    return outcome === undefined ? coin : `${outcome.label} · ${outcome.sides[encoding % 10]}`
  }

  async function cancel(asset: number, oid: number) {
    const agent = readAgent(network, master)
    if (agent === null) {
      setMessage('Approve a trading key in Settings to cancel.')
      return
    }
    setBusyOid(oid)
    setMessage(null)
    try {
      const refused = await cancelOrder(network, agent, asset, oid)
      setMessage(refused === null ? `Order ${oid} canceled.` : `Cancel refused: ${refused}`)
    } catch (exc) {
      setMessage(walletErrorMessage(exc))
    } finally {
      setBusyOid(null)
      refreshAfterTrade(queryClient, network)
    }
  }

  if (orders.isPending) {
    return null
  }
  return (
    <div className="open-orders">
      <strong>Your open {network.name} orders</strong>
      {orders.isError && <p className="wallet-error trading-key-error" role="alert">Could not load open orders.</p>}
      {orders.data?.length === 0 && <p className="order-ticket-dry">None.</p>}
      {orders.data !== undefined && orders.data.length > 0 && (
        <ul>
          {orders.data.map((order) => (
            <li key={order.oid}>
              <span>
                {order.isBuy ? 'Buy' : 'Sell'} {order.sz}
                {order.sz !== order.origSz && ` of ${order.origSz}`} @ {order.limitPx} · {describe(order.coin)}{' '}
                <small>order {order.oid}</small>
              </span>
              <button type="button" disabled={busyOid !== null} onClick={() => void cancel(order.asset, order.oid)}>
                {busyOid === order.oid ? 'Canceling…' : 'Cancel'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message !== null && <p className="trading-key-message" role="status">{message}</p>}
    </div>
  )
}

export default OpenOrders