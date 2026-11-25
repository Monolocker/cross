import { skipToken, useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchTestnetOutcomes } from '../../api/markets'
import { postInfo, type Network } from './client'
import { parseOutcomeFills, parseOutcomeOrderHistory } from './history'
import { parseOpenOutcomeOrders } from './orders'
import { outcomeMarks, parseOutcomePositions } from './positions'
import { outcomeVolumes, toTestnetOutcomes } from './testnetMarkets'
import { availableBalances, bookTop, type BookTop } from './ticket'

// Hyperliquid info queries made from the browser (Milestone 27.5),
// cached by TanStack Query like the rest of the app's data.
//
// 28.0b: when two views need the same response (balances and positions
// both come from spotClearinghouseState), the cache keeps the RAW
// response under one key and each hook derives its view with `select`.
// One request serves both; two hooks writing different shapes under
// one key would overwrite each other.

// Testnet's market list comes from OUR backend, which titles it with
// the same code as mainnet (27.7b). Only metadata: no orders go there.
export function useTestnetOutcomes() {
  return useQuery({
    queryKey: ['backend', 'testnetOutcomes'],
    queryFn: async ({ signal }) => toTestnetOutcomes(await fetchTestnetOutcomes(signal)),
    staleTime: 5 * 60_000,
  })
}

function spotContextsQuery(network: Network) {
  return {
    queryKey: ['hyperliquid', network.name, 'spotMetaAndAssetCtxs'],
    queryFn: () => postInfo(network, { type: 'spotMetaAndAssetCtxs' }),
  }
}

export function useOutcomeVolumes(network: Network) {
  return useQuery({ ...spotContextsQuery(network), select: outcomeVolumes, staleTime: 60_000 })
}

// Marks for valuing positions (29.1), refreshed more often than the volumes.
export function useOutcomeMarks(network: Network) {
  return useQuery({ ...spotContextsQuery(network), select: outcomeMarks, refetchInterval: 15_000 })
}

function bookQueryKey(network: Network, coin: string | null) {
  return ['hyperliquid', network.name, 'l2Book', coin]
}

export function useBookTop(network: Network, coin: string | null) {
  return useQuery({
    queryKey: bookQueryKey(network, coin),
    queryFn: coin === null ? skipToken : async () => bookTop(await postInfo(network, { type: 'l2Book', coin })),
    refetchInterval: 5_000,
  })
}

// A fresh book, fetched once on request (29.1: Sell / Close All price
// from books fetched when you open the confirmation, then held still).
export function fetchBookTop(queryClient: QueryClient, network: Network, coin: string): Promise<BookTop | null> {
  return queryClient.fetchQuery({
    queryKey: bookQueryKey(network, coin),
    queryFn: async () => bookTop(await postInfo(network, { type: 'l2Book', coin })),
    staleTime: 0,
  })
}

function spotStateQuery(network: Network, user: string) {
  return {
    queryKey: ['hyperliquid', network.name, 'spotClearinghouseState', user],
    queryFn: () => postInfo(network, { type: 'spotClearinghouseState', user }),
    refetchInterval: 15_000,
  }
}

export function useAvailableBalances(network: Network, user: string) {
  return useQuery({ ...spotStateQuery(network, user), select: availableBalances })
}

export function useOutcomePositions(network: Network, user: string) {
  return useQuery({ ...spotStateQuery(network, user), select: parseOutcomePositions })
}

export function useOpenOutcomeOrders(network: Network, user: string) {
  return useQuery({
    queryKey: ['hyperliquid', network.name, 'frontendOpenOrders', user],
    queryFn: async () => parseOpenOutcomeOrders(await postInfo(network, { type: 'frontendOpenOrders', user })),
    refetchInterval: 5_000,
  })
}

// Trade and order history (29.0): outcome entries only.
export function useOutcomeFills(network: Network, user: string) {
  return useQuery({
    queryKey: ['hyperliquid', network.name, 'userFills', user],
    queryFn: async () => parseOutcomeFills(await postInfo(network, { type: 'userFills', user })),
    refetchInterval: 30_000,
  })
}

export function useOutcomeOrderHistory(network: Network, user: string) {
  return useQuery({
    queryKey: ['hyperliquid', network.name, 'historicalOrders', user],
    queryFn: async () => parseOutcomeOrderHistory(await postInfo(network, { type: 'historicalOrders', user })),
    refetchInterval: 30_000,
  })
}

// After an order or cancel: refetch what it changes (balances and
// positions, open orders, books, history), not the market list.
export function refreshAfterTrade(queryClient: QueryClient, network: Network) {
  for (const kind of ['spotClearinghouseState', 'frontendOpenOrders', 'l2Book', 'userFills', 'historicalOrders']) {
    void queryClient.invalidateQueries({ queryKey: ['hyperliquid', network.name, kind] })
  }
}
