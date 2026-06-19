import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getConfig, isConfigured } from '../config';
import { getQueryClient } from '../query/client';
import { hashQueryKey, type QueryKey } from '../query/key';
import { buildEndpoint, executeRequest, handleResponse } from '../utils';

import type {
  RequestConfig,
  ResponseWrapper,
  UsePaginateOptions,
  UsePaginateResult,
} from '../types/index';

/**
 * Hook for paginated data fetching.
 *
 * Фаза 4: страницы кэшируются как отдельные записи под подключами вида
 * `[...prefix, { page, limit }]`. Это даёт:
 * - повторное открытие списка → данные из кэша мгновенно;
 * - keepPreviousData → плавная смена страницы;
 * - prefetchNextPage → префетч в кэш без визуального изменения.
 */
export function createUsePaginate<
  ResponseType extends { data: TData; total?: number; page?: number },
  TData extends unknown[],
  RequestParamsType,
  ErrorResponseType,
>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  fetchConfig: RequestConfig,
  options?: {
    dataExtractor?: (response: ResponseType) => TData;
    totalExtractor?: (response: ResponseType) => number;
  },
) {
  type RT = ResponseWrapper<ResponseType, ErrorResponseType>;

  return <TSelected = TData>(
    params?: Omit<RequestParamsType, 'page' | 'limit'>,
    hookOptions: UsePaginateOptions<RT, TData, TSelected> = {},
  ): UsePaginateResult<TSelected> => {
    const {
      enabled = true,
      initialPage = 1,
      initialLimit = 20,
      staleTime = isConfigured() ? getConfig().defaultStaleTime ?? 0 : 0,
      gcTime,
      keepPreviousData = false,
      queryKey: customKey,
      select,
      selectIsEqual,
      onSuccess,
      onError,
    } = hookOptions;

    const client = getQueryClient();
    const cache = client.cache;

    const limit = initialLimit;
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const dataExtractor = useMemo(
      () =>
        options?.dataExtractor || ((response: ResponseType) => response.data),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );
    const totalExtractor = useMemo(
      () =>
        options?.totalExtractor ||
        ((response: ResponseType) => response.total ?? 0),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const serializedParams = useMemo(
      () => (params === undefined ? null : JSON.stringify(params)),
      [params],
    );

    const keyPrefix = useMemo<QueryKey>(() => {
      if (customKey) return customKey;
      const endpointId =
        typeof endpoint === 'function'
          ? buildEndpoint<RequestParamsType>(
              endpoint,
              params as RequestParamsType,
            )
          : endpoint;
      return ['__paginate__', endpointId, params ?? null];
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customKey ? hashQueryKey(customKey) : null, serializedParams]);

    const pageKey = useCallback(
      (page: number): QueryKey => [...keyPrefix, { page, limit }],
      [keyPrefix, limit],
    );

    const pageQueryFn = useCallback(
      (page: number) =>
        ({ signal }: { signal: AbortSignal }) => {
          const parsedParams = serializedParams
            ? (JSON.parse(serializedParams) as Record<string, unknown>)
            : {};
          const requestParams = {
            ...parsedParams,
            page,
            limit,
          } as RequestParamsType;
          return executeRequest<
            ResponseType,
            RequestParamsType,
            ErrorResponseType
          >(endpoint, fetchConfig, requestParams, signal);
        },
      [serializedParams, limit],
    );

    // Подписка на ключ текущей страницы для rerender.
    const [, forceRender] = useState(0);
    const rerender = useCallback(() => forceRender(v => v + 1), []);
    useEffect(() => {
      if (!enabled) return;
      const unsub = cache.subscribe(pageKey(currentPage), rerender);
      return unsub;
    }, [cache, enabled, hashQueryKey(pageKey(currentPage)), rerender]);

    const previousPageKeyRef = useRef<QueryKey | null>(null);

    const runFetchPage = useCallback(
      async (page: number, isNextPage: boolean) => {
        try {
          if (isNextPage) setIsFetchingNextPage(true);
          setError(null);

          const result = await cache.fetch(pageKey(page), pageQueryFn(page), {
            staleTime,
            gcTime,
          });

          handleResponse<ResponseType, ErrorResponseType>(
            result,
            onSuccess,
            onError,
          );
          if (!result.status) {
            setError(new Error(result.message ?? 'Request failed'));
            return;
          }

          previousPageKeyRef.current = pageKey(page);
          setCurrentPage(page);
        } catch (err) {
          const e = err as Error;
          setError(e);
          onError?.(e);
        } finally {
          if (isNextPage) setIsFetchingNextPage(false);
        }
      },
      [cache, pageKey, pageQueryFn, staleTime, gcTime, onSuccess, onError],
    );

    // Первичный mount + смена params.
    useEffect(() => {
      if (!enabled) return;
      void runFetchPage(initialPage, false);
      setCurrentPage(initialPage);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, serializedParams, initialPage]);

    // Auto-refetch при isStale (внешний invalidateQueries).
    const currentState = cache.getState<RT>(pageKey(currentPage));
    const isStale = currentState?.isStale ?? false;
    const hasFetchedData = currentState?.data !== undefined;
    useEffect(() => {
      if (!enabled) return;
      if (isStale && hasFetchedData) void runFetchPage(currentPage, false);
    }, [enabled, isStale, hasFetchedData, currentPage, runFetchPage]);

    // Источник данных для UI с учётом keepPreviousData.
    const currentResult = currentState?.data;
    const usingPlaceholder =
      keepPreviousData &&
      !currentResult &&
      previousPageKeyRef.current !== null;
    const effectiveResult = usingPlaceholder
      ? cache.getData<RT>(previousPageKeyRef.current as QueryKey)
      : currentResult;

    const rawData: TData =
      effectiveResult && effectiveResult.status
        ? dataExtractor(effectiveResult as ResponseType)
        : ([] as unknown as TData);

    const lastSelectedRef = useRef<TSelected | null>(null);
    const data: TSelected = useMemo(() => {
      const next = select
        ? select(rawData)
        : (rawData as unknown as TSelected);
      const prev = lastSelectedRef.current;
      const isEqual = selectIsEqual ?? Object.is;
      if (prev !== null && isEqual(prev, next)) return prev;
      lastSelectedRef.current = next;
      return next;
    }, [rawData, select, selectIsEqual]);

    const totalCount =
      effectiveResult && effectiveResult.status
        ? totalExtractor(effectiveResult as ResponseType)
        : null;
    const total = totalCount;
    const totalPages = totalCount !== null ? Math.ceil(totalCount / limit) : null;
    const hasNextPage = totalPages !== null && currentPage < totalPages;
    const hasPreviousPage = currentPage > 1;

    const status = currentState?.status ?? 'idle';
    const isLoading = status === 'loading' && !hasFetchedData && !usingPlaceholder;

    const fetchNextPage = useCallback(async () => {
      if (!hasNextPage) return;
      await runFetchPage(currentPage + 1, true);
    }, [hasNextPage, currentPage, runFetchPage]);

    const fetchPreviousPage = useCallback(async () => {
      if (!hasPreviousPage) return;
      await runFetchPage(currentPage - 1, false);
    }, [hasPreviousPage, currentPage, runFetchPage]);

    const prefetchNextPage = useCallback(async () => {
      if (!hasNextPage) return;
      // Просто складываем в кэш — не меняем currentPage, не показываем loading.
      await cache.fetch(
        pageKey(currentPage + 1),
        pageQueryFn(currentPage + 1),
        { staleTime, gcTime },
      );
    }, [hasNextPage, currentPage, cache, pageKey, pageQueryFn, staleTime, gcTime]);

    const refetch = useCallback(async () => {
      await cache.fetch(pageKey(currentPage), pageQueryFn(currentPage), {
        staleTime: 0,
        gcTime,
        force: true,
      });
    }, [cache, pageKey, pageQueryFn, currentPage, gcTime]);

    const reset = useCallback(() => {
      // Удаляем все страницы текущего префикса.
      cache.remove((k: QueryKey) => {
        if (k.length < keyPrefix.length) return false;
        for (let i = 0; i < keyPrefix.length; i++) {
          if (hashQueryKey([k[i]]) !== hashQueryKey([keyPrefix[i]])) return false;
        }
        return true;
      });
      previousPageKeyRef.current = null;
      setCurrentPage(initialPage);
      void runFetchPage(initialPage, false);
    }, [cache, keyPrefix, initialPage, runFetchPage]);

    return {
      data,
      currentPage,
      totalPages,
      total,
      hasNextPage,
      hasPreviousPage,
      isLoading: enabled ? isLoading : false,
      isFetchingNextPage,
      isPlaceholderData: usingPlaceholder,
      error,
      fetchNextPage,
      fetchPreviousPage,
      prefetchNextPage,
      refetch,
      reset,
    };
  };
}
