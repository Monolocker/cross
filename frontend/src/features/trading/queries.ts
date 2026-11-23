import { skipToken, useQuery, type QueryClient } from '@tanstack/react-query'
import { postInfo, type Network } from './client'
import { parseOpenOutcomeOrders} from './orders'
import { outcomeVolumes, parseOutcomes } from './testnetMarkets'
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

export function useOutcomeVolumes(network: Network) {
    return useQuery({
      queryKey: ['hyperliquid', network.name, 'spotMetaAndAssetCtxs'],
      queryFn: async () => outcomeVolumes(await postInfo(network, { type: 'spotMetaAndAssetCtxs' })),
      staleTime: 60_000,
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

export function useOpenOutcomeOrders(network: Network, user: string) {
    return useQuery({
      queryKey: ['hyperliquid', network.name, 'frontendOpenOrders', user],
      queryFn: async () => parseOpenOutcomeOrders(await postInfo(network, { type: 'frontendOpenOrders', user })),
      refetchInterval: 5_000,
    })
  }
  
  // After an order or cancel: refetch what it changes (balances, open
  // orders, books), not the market list.
  export function refreshAfterTrade(queryClient: QueryClient, network: Network) {
    for (const kind of ['spotClearinghouseState', 'frontendOpenOrders', 'l2Book']) {
      void queryClient.invalidateQueries({ queryKey: ['hyperliquid', network.name, kind] })
    }
  }