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
      mode = 'page',
      getItemKey,
      onSuccess,
      onError,
    } = hookOptions;
    const isInfinite = mode === 'infinite';

    const client = getQueryClient();
    const cache = client.cache;

    const limit = initialLimit;
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    // Только для mode: 'infinite'. Список номеров загруженных страниц
    // в порядке загрузки. Данные берутся из кэша на каждый рендер.
    const [loadedPages, setLoadedPages] = useState<number[]>([initialPage]);

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

    // Подписка: в page-режиме — только на текущую страницу;
    // в infinite — на все загруженные (любая инвалидация → ререндер).
    const [, forceRender] = useState(0);
    const rerender = useCallback(() => forceRender(v => v + 1), []);
    const keyPrefixHash = useMemo(() => hashQueryKey(keyPrefix), [keyPrefix]);

    const subscribedPages = isInfinite ? loadedPages : [currentPage];
    const subscribedPagesKey = subscribedPages.join(',');
    useEffect(() => {
      if (!enabled) return;
      const unsubs = subscribedPages.map(p =>
        cache.subscribe(pageKey(p), rerender),
      );
      return () => {
        for (const u of unsubs) u();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cache, enabled, subscribedPagesKey, keyPrefixHash, rerender]);

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
          if (isInfinite && isNextPage) {
            setLoadedPages(prev =>
              prev.includes(page) ? prev : [...prev, page],
            );
          }
        } catch (err) {
          const e = err as Error;
          setError(e);
          onError?.(e);
        } finally {
          if (isNextPage) setIsFetchingNextPage(false);
        }
      },
      [
        cache,
        pageKey,
        pageQueryFn,
        staleTime,
        gcTime,
        onSuccess,
        onError,
        isInfinite,
      ],
    );

    // Первичный mount + смена params: сбрасываем аккумулятор и
    // запрашиваем заново page = initialPage.
    useEffect(() => {
      if (!enabled) return;
      setCurrentPage(initialPage);
      if (isInfinite) setLoadedPages([initialPage]);
      void runFetchPage(initialPage, false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, serializedParams, initialPage]);

    // Auto-refetch при isStale (внешний invalidateQueries).
    // В page-режиме рефетчим текущую страницу; в infinite — все loaded.
    const currentState = cache.getState<RT>(pageKey(currentPage));
    const isStale = currentState?.isStale ?? false;
    const hasFetchedData = currentState?.data !== undefined;
    useEffect(() => {
      if (!enabled) return;
      if (!isStale || !hasFetchedData) return;
      if (isInfinite) {
        // Пересобираем все загруженные страницы.
        for (const p of loadedPages) {
          void cache.fetch(pageKey(p), pageQueryFn(p), {
            staleTime: 0,
            gcTime,
            force: true,
          });
        }
      } else {
        void runFetchPage(currentPage, false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, isStale, hasFetchedData, currentPage]);

    // Источник данных для UI.
    const currentResult = currentState?.data;
    const usingPlaceholder =
      !isInfinite &&
      keepPreviousData &&
      !currentResult &&
      previousPageKeyRef.current !== null;
    const effectiveResult = usingPlaceholder
      ? cache.getData<RT>(previousPageKeyRef.current as QueryKey)
      : currentResult;

    // Аккумулированный массив для infinite-режима. Собирается из
    // последовательно загруженных страниц, опционально дедуплицируется
    // через getItemKey. Зависит от subscribedPagesKey и от данных в
    // кэше — этого достаточно, потому что подписка на каждую страницу
    // уже триггерит ререндер.
    const rawData: TData = useMemo(() => {
      if (!isInfinite) {
        return effectiveResult && effectiveResult.status
          ? dataExtractor(effectiveResult as ResponseType)
          : ([] as unknown as TData);
      }
      const acc: unknown[] = [];
      const seen = getItemKey ? new Set<string | number>() : null;
      for (const p of loadedPages) {
        const pageResult = cache.getData<RT>(pageKey(p));
        if (!pageResult || !pageResult.status) continue;
        const items = dataExtractor(pageResult as ResponseType) as unknown[];
        if (!seen) {
          acc.push(...items);
          continue;
        }
        for (const item of items) {
          const k = getItemKey!(
            item as TData extends Array<infer U> ? U : never,
          );
          if (seen.has(k)) continue;
          seen.add(k);
          acc.push(item);
        }
      }
      return acc as unknown as TData;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      isInfinite,
      effectiveResult,
      subscribedPagesKey,
      // данные в кэше не реактивны напрямую — но `rerender` уже
      // выставлен из subscribe; пересчёт идёт на каждом ререндере.
      // Включаем currentState чтобы reuse work при текущей странице.
      currentState?.updatedAt,
      dataExtractor,
      getItemKey,
    ]);

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
    const hasPreviousPage = !isInfinite && currentPage > 1;

    const status = currentState?.status ?? 'idle';
    const isLoading = status === 'loading' && !hasFetchedData && !usingPlaceholder;

    const fetchNextPage = useCallback(async () => {
      if (!hasNextPage) return;
      await runFetchPage(currentPage + 1, true);
    }, [hasNextPage, currentPage, runFetchPage]);

    const fetchPreviousPage = useCallback(async () => {
      // В infinite-режиме предыдущая страница уже в data; no-op.
      if (isInfinite) return;
      if (!hasPreviousPage) return;
      await runFetchPage(currentPage - 1, false);
    }, [isInfinite, hasPreviousPage, currentPage, runFetchPage]);

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
      if (isInfinite) {
        // Перезапрашиваем все загруженные страницы.
        await Promise.all(
          loadedPages.map(p =>
            cache.fetch(pageKey(p), pageQueryFn(p), {
              staleTime: 0,
              gcTime,
              force: true,
            }),
          ),
        );
        return;
      }
      await cache.fetch(pageKey(currentPage), pageQueryFn(currentPage), {
        staleTime: 0,
        gcTime,
        force: true,
      });
    }, [
      isInfinite,
      loadedPages,
      cache,
      pageKey,
      pageQueryFn,
      currentPage,
      gcTime,
    ]);

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
      if (isInfinite) setLoadedPages([initialPage]);
      void runFetchPage(initialPage, false);
    }, [cache, keyPrefix, initialPage, runFetchPage, isInfinite]);

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
