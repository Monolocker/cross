import { skipToken, useQuery } from '@tanstack/react-query'
import { postInfo, type Network } from './client'
import { parseOutcomes } from './testnetMarkets'
import { availableBalances, bookTop } from './ticket'

// Hyperliquid info queries made from the browser (Milestone 27.5),
// cached by TanStack Query like the rest of the app's data.

export function useOutcomeList(network: Network) {
  return useQuery({
    queryKey: ['hyperliquid', network.name, 'outcomeMeta'],
    queryFn: async () => parseOutcomes(await postInfo(network, { type: 'outcomeMeta' })),
    staleTime: 5 * 60_000,
  })
}

export function useBookTop(network: Network, coin: string | null) {
  return useQuery({
    queryKey: ['hyperliquid', network.name, 'l2Book', coin],
    queryFn: coin === null ? skipToken : async () => bookTop(await postInfo(network, { type: 'l2Book', coin })),
    refetchInterval: 5_000,
  })
}

export function useAvailableBalances(network: Network, user: string) {
  return useQuery({
    queryKey: ['hyperliquid', network.name, 'spotClearinghouseState', user],
    queryFn: async () => availableBalances(await postInfo(network, { type: 'spotClearinghouseState', user })),
    refetchInterval: 15_000,
  })
}