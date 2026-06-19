import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getConfig, isConfigured } from '../config';
import { callLogger } from '../logger';
import { focusManager } from '../query/focus-manager';
import { onlineManager } from '../query/online-manager';
import { hashQueryKey, type QueryKey } from '../query/key';
import { getQueryClient } from '../query/client';
import { buildEndpoint, executeRequest, handleResponse } from '../utils';

import type {
  RequestConfig,
  ResponseWrapper,
  UseFetchOptions,
  UseFetchResult,
} from '../types/index';

/**
 * Hook for fetching data (GET requests).
 *
 * Поверх QueryCache: одинаковые queryKey разделяют один результат и один
 * inflight-promise. Поддерживает staleTime, refetchOnFocus,
 * pollingInterval, select.
 *
 * Возвращаемый тип { data, isLoading, isRefetching, error, refetch }
 * сохранён 1-в-1 с предыдущей версией — старые потребители продолжают работать.
 */
export function createUseFetch<
  ResponseType,
  RequestParamsType,
  ErrorResponseType,
>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  fetchConfig: RequestConfig,
) {
  type RT = ResponseWrapper<ResponseType, ErrorResponseType>;

  return <TSelected = RT>(
    params?: RequestParamsType,
    options: UseFetchOptions<RT, TSelected> = {},
  ): UseFetchResult<TSelected> => {
    const {
      enabled = true,
      refetchOnMount = true,
      refetchOnFocus = false,
      refetchOnAppActive = false,
      refetchOnReconnect = false,
      staleTime = isConfigured() ? getConfig().defaultStaleTime ?? 0 : 0,
      gcTime,
      pollingInterval,
      queryKey: customKey,
      select,
      selectIsEqual,
      onSuccess,
      onError,
    } = options;

    const serializedParams = useMemo(
      () => (params === undefined ? null : JSON.stringify(params)),
      [params],
    );

    const queryKey = useMemo<QueryKey>(() => {
      if (customKey) return customKey;
      const endpointId =
        typeof endpoint === 'function'
          ? buildEndpoint<RequestParamsType>(endpoint, params)
          : endpoint;
      return ['__endpoint__', endpointId, params ?? null];
      // params уже учтён через serializedParams ниже
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customKey ? hashQueryKey(customKey) : null, serializedParams]);

    const client = getQueryClient();
    const cache = client.cache;

    // queryFn — стабилен относительно serializedParams, не пересоздаём
    // на каждый рендер. Принимает signal от QueryCache и пробрасывает
    // его в executeRequest → httpClient.
    const queryFn = useCallback(
      ({ signal }: { signal: AbortSignal }) => {
        const parsedParams = serializedParams
          ? (JSON.parse(serializedParams) as RequestParamsType)
          : undefined;
        return executeRequest<
          ResponseType,
          RequestParamsType,
          ErrorResponseType
        >(endpoint, fetchConfig, parsedParams, signal);
      },
      [serializedParams],
    );

    const initialState = cache.getState<RT>(queryKey);
    const [, forceRender] = useState(0);
    const rerender = useCallback(() => forceRender(v => v + 1), []);

    // Подписка на изменения ключа — работает даже при enabled: false,
    // чтобы хук выступал read-only слушателем кэша. Полезно для
    // бейджей/счётчиков, которые читают тот же ключ, что пишут другие
    // экраны (см. JSDoc для `enabled`).
    //
    // На unmount: если стали последним подписчиком и запрос ещё inflight —
    // отменяем HTTP, чтобы не держать соединение зря.
    useEffect(() => {
      const unsub = cache.subscribe(queryKey, rerender);
      return () => {
        unsub();
        const state = cache._debugEntries().get(hashQueryKey(queryKey));
        if (state && state.subscribers.size === 0 && state.inflight) {
          cache.cancelQueries(queryKey);
        }
      };
    }, [cache, hashQueryKey(queryKey), rerender]);

    // Триггер запроса при mount / смене ключа / stale-инвалидации.
    const lastNotifiedRef = useRef<{
      success?: RT;
      errorHash?: string;
    }>({});

    const runFetch = useCallback(
      async (force: boolean) => {
        callLogger('onFetchStart', queryKey);
        try {
          const data = await cache.fetch(queryKey, queryFn, {
            staleTime,
            gcTime,
            force,
          });
          callLogger('onFetchSuccess', queryKey, data);
          // onSuccess / onError — на основе бизнес-статуса
          if (lastNotifiedRef.current.success !== data) {
            lastNotifiedRef.current.success = data;
            handleResponse<ResponseType, ErrorResponseType>(
              data,
              onSuccess,
              onError,
            );
          }
        } catch (err) {
          callLogger('onFetchError', queryKey, err);
          const e = err as Error;
          const hash = `${e.name}:${e.message}`;
          if (lastNotifiedRef.current.errorHash !== hash) {
            lastNotifiedRef.current.errorHash = hash;
            onError?.(e);
          }
        }
      },
      [cache, hashQueryKey(queryKey), queryFn, staleTime, gcTime, onSuccess, onError],
    );

    useEffect(() => {
      if (!enabled || !refetchOnMount) return;
      void runFetch(false);
    }, [enabled, refetchOnMount, runFetch]);

    // Реакция на внешний invalidate: подписчик уже получил notify
    // (rerender), здесь смотрим isStale в кэше и догоняем запросом.
    const stateForEffect = cache.getState<RT>(queryKey);
    const isStale = stateForEffect?.isStale ?? false;
    const hasFetchedData = stateForEffect?.data !== undefined;
    useEffect(() => {
      if (!enabled) return;
      if (isStale && hasFetchedData) void runFetch(true);
    }, [enabled, isStale, hasFetchedData, runFetch]);

    // refetchOnFocus / refetchOnAppActive — обе настройки висят на одном
    // focusManager (RN AppState → focusManager.setFocused). Если хоть одна
    // включена — подписываемся.
    useEffect(() => {
      if (!enabled) return;
      if (!refetchOnFocus && !refetchOnAppActive) return;
      const unsub = focusManager.subscribe(focused => {
        if (focused) void runFetch(false);
      });
      return unsub;
    }, [enabled, refetchOnFocus, refetchOnAppActive, runFetch]);

    // refetchOnReconnect: подписываемся на onlineManager.
    useEffect(() => {
      if (!enabled || !refetchOnReconnect) return;
      const unsub = onlineManager.subscribe(online => {
        if (online) void runFetch(false);
      });
      return unsub;
    }, [enabled, refetchOnReconnect, runFetch]);

    // Поллинг с авто-паузой при !focused.
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

    // Текущее состояние из кэша.
    const state = cache.getState<RT>(queryKey) ?? initialState;
    const rawData = state?.data ?? null;

    // select мемоизация: пересчёт только если rawData меняется ссылочно
    // или меняется select. selectIsEqual позволяет structural-сравнение,
    // чтобы равные, но новые по ссылке объекты не вызывали ререндер.
    const lastSelectedRef = useRef<TSelected | null>(null);
    const selectedData = useMemo<TSelected | null>(() => {
      if (rawData === null) {
        lastSelectedRef.current = null;
        return null;
      }
      const next = select
        ? select(rawData)
        : (rawData as unknown as TSelected);
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
  };
}
