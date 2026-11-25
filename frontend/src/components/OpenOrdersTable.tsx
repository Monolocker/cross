import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { cents, dollars, outcomeName, sideLabel } from '../features/trading/account'
import { readAgent } from '../features/trading/agentStore'
import type { Network } from '../features/trading/client'
import type { OutcomeCoin } from '../features/trading/history'
import { cancelOrder, type OpenOutcomeOrder } from '../features/trading/orders'
import { refreshAfterTrade } from '../features/trading/queries'
import type { TestnetOutcome } from '../features/trading/testnetMarkets'
import { walletErrorMessage } from '../features/wallet/eip1193'

export type OpenOrderRow = OpenOutcomeOrder & OutcomeCoin

interface OpenOrdersTableProps {
  network: Network
  master: string
  rows: OpenOrderRow[]
  outcomes: TestnetOutcome[] | undefined
}

// Milestone 29.1 (from 27.6's list): your open outcome orders, each with Cancel.
function OpenOrdersTable({ network, master, rows, outcomes }: OpenOrdersTableProps) {
  const queryClient = useQueryClient()
  const [busyOid, setBusyOid] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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

  return (
    <>
      <table className="account-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th className="num">Price</th>
            <th className="num">Filled / Size</th>
            <th className="num">Value</th>
            <th>Placed</th>
            <th className="num" />
          </tr>
        </thead>
        <tbody>
          {rows.map((order) => (
            <tr key={order.oid}>
              <td><strong>{outcomeName(order.outcomeId, outcomes)}</strong></td>
              <td className={order.isBuy ? 'history-buy' : 'history-sell'}>
                {order.isBuy ? 'Buy' : 'Sell'} {sideLabel(order, outcomes)}
              </td>
              <td className="num">{cents(Number(order.limitPx))}</td>
              <td className="num">{Number(order.origSz) - Number(order.sz)} / {Number(order.origSz)}</td>
              <td className="num">{dollars(Number(order.limitPx) * Number(order.sz))}</td>
              <td className="account-muted">{new Date(order.timestamp).toLocaleString()}</td>
              <td className="num">
                <button type="button" disabled={busyOid !== null} onClick={() => void cancel(order.asset, order.oid)}>
                  {busyOid === order.oid ? 'Canceling…' : 'Cancel'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {message !== null && <p className="trading-key-message" role="status">{message}</p>}
    </>
  )
}

export default OpenOrdersTable
