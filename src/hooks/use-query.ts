import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { callLogger } from '../logger';
import type { FetchOptions, QueryFn } from '../query/cache';
import { getQueryClient } from '../query/client';
import { focusManager } from '../query/focus-manager';
import { hashQueryKey, type QueryKey } from '../query/key';
import { onlineManager } from '../query/online-manager';

/** Опции для низкоуровневого `useQuery`. */
export type UseQueryOptions<T, TSelected = T> = {
  enabled?: boolean;
  refetchOnMount?: boolean;
  refetchOnFocus?: boolean;
  refetchOnAppActive?: boolean;
  refetchOnReconnect?: boolean;
  staleTime?: number;
  gcTime?: number;
  pollingInterval?: number;
  select?: (data: T) => TSelected;
  selectIsEqual?: (a: TSelected, b: TSelected) => boolean;
};

export type UseQueryResult<T> = {
  data: T | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

/**
 * Низкоуровневый аналог `useFetch` поверх произвольного `queryFn`.
 * Имя совпадает с TanStack Query для discoverability — поведение
 * аналогично `useFetch`, но без обёртки `apiClient(endpoint, ...)`.
 *
 * @example
 * const { data } = useQuery(
 *   ['orders', orderId],
 *   ({ signal }) => fetchOrder(orderId, signal),
 *   { staleTime: 30_000 },
 * );
 */
export function useQuery<T, TSelected = T>(
  queryKey: QueryKey,
  queryFn: QueryFn<T>,
  options: UseQueryOptions<T, TSelected> = {},
): UseQueryResult<TSelected> {
  const {
    enabled = true,
    refetchOnMount = true,
    refetchOnFocus = false,
    refetchOnAppActive = false,
    refetchOnReconnect = false,
    staleTime = 0,
    gcTime,
    pollingInterval,
    select,
    selectIsEqual,
  } = options;

  const client = getQueryClient();
  const cache = client.cache;
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender(v => v + 1), []);

  useEffect(() => {
    const unsub = cache.subscribe(queryKey, rerender);
    return () => {
      unsub();
      const state = cache._debugEntries().get(hashQueryKey(queryKey));
      if (state && state.subscribers.size === 0 && state.inflight) {
        cache.cancelQueries(queryKey);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, hashQueryKey(queryKey), rerender]);

  const runFetch = useCallback(
    async (force: boolean) => {
      callLogger('onFetchStart', queryKey);
      try {
        const data = await cache.fetch(queryKey, queryFn, {
          staleTime,
          gcTime,
          force,
        } satisfies FetchOptions);
        callLogger('onFetchSuccess', queryKey, data);
      } catch (err) {
        callLogger('onFetchError', queryKey, err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cache, hashQueryKey(queryKey), queryFn, staleTime, gcTime],
  );

  useEffect(() => {
    if (!enabled || !refetchOnMount) return;
    void runFetch(false);
  }, [enabled, refetchOnMount, runFetch]);

  const stateForEffect = cache.getState<T>(queryKey);
  const isStale = stateForEffect?.isStale ?? false;
  const hasFetchedData = stateForEffect?.data !== undefined;
  useEffect(() => {
    if (!enabled) return;
    if (isStale && hasFetchedData) void runFetch(true);
  }, [enabled, isStale, hasFetchedData, runFetch]);

  useEffect(() => {
    if (!enabled) return;
    if (!refetchOnFocus && !refetchOnAppActive) return;
    const unsub = focusManager.subscribe(focused => {
      if (focused) void runFetch(false);
    });
    return unsub;
  }, [enabled, refetchOnFocus, refetchOnAppActive, runFetch]);

  useEffect(() => {
    if (!enabled || !refetchOnReconnect) return;
    const unsub = onlineManager.subscribe(online => {
      if (online) void runFetch(false);
    });
    return unsub;
  }, [enabled, refetchOnReconnect, runFetch]);

  useEffect(() => {
    if (!enabled || !pollingInterval || pollingInterval <= 0) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (focusManager.isFocused()) void runFetch(true);
      }, pollingInterval);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    start();
    const unsub = focusManager.subscribe(focused => {
      if (focused) start();
      else stop();
    });
    return () => {
      stop();
      unsub();
    };
  }, [enabled, pollingInterval, runFetch]);

  const state = cache.getState<T>(queryKey);
  const rawData = state?.data ?? null;
  const lastSelectedRef = useRef<TSelected | null>(null);
  const selectedData = useMemo<TSelected | null>(() => {
    if (rawData === null) {
      lastSelectedRef.current = null;
      return null;
    }
    const next = select ? select(rawData) : (rawData as unknown as TSelected);
    const prev = lastSelectedRef.current;
    const isEqual = selectIsEqual ?? Object.is;
    if (prev !== null && isEqual(prev, next)) return prev;
    lastSelectedRef.current = next;
    return next;
  }, [rawData, select, selectIsEqual]);

  const status = state?.status ?? 'idle';
  const hasData = rawData !== null;
  const isLoading = status === 'loading' && !hasData;
  const isRefetching = status === 'loading' && hasData;
  const error = state?.error ?? null;

  const refetch = useCallback(async () => {
    await runFetch(true);
  }, [runFetch]);

  return {
    data: selectedData,
    isLoading: enabled ? isLoading : false,
    isRefetching,
    error,
    refetch,
  };
}
