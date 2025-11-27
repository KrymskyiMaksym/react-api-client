import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { executeRequest, handleResponse } from '../utils';

import type {
  RequestConfig,
  ResponseWrapper,
  UsePaginateOptions,
  UsePaginateResult,
} from '../types/index';

/**
 * Hook for paginated data fetching
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
  return (
    params?: Omit<RequestParamsType, 'page' | 'limit'>,
    hookOptions: UsePaginateOptions<
      ResponseWrapper<ResponseType, ErrorResponseType>
    > = {},
  ): UsePaginateResult<TData> => {
    const {
      enabled = true,
      initialPage = 1,
      initialLimit = 20,
      onSuccess,
      onError,
    } = hookOptions;

    const [data, setData] = useState<TData>([] as unknown as TData);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState<number | null>(null);
    const [total, setTotal] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(enabled);
    const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const isMountedRef = useRef(true);
    const limit = initialLimit;

    const dataExtractor = useMemo(
      () =>
        options?.dataExtractor || ((response: ResponseType) => response.data),
      [],
    );

    const totalExtractor = useMemo(
      () =>
        options?.totalExtractor ||
        ((response: ResponseType) => response.total ?? 0),
      [],
    );

    const serializedParams = useMemo(
      () => (params ? JSON.stringify(params) : null),
      [params],
    );

    const fetchPage = useCallback(
      async (page: number, append = false) => {
        if (!enabled) return;

        try {
          if (append) {
            setIsFetchingNextPage(true);
          } else {
            setIsLoading(true);
          }
          setError(null);

          const parsedParams = serializedParams
            ? JSON.parse(serializedParams)
            : {};
          const requestParams = {
            ...parsedParams,
            page,
            limit,
          } as RequestParamsType;

          const result = await executeRequest<
            ResponseType,
            RequestParamsType,
            ErrorResponseType
          >(endpoint, fetchConfig, requestParams);

          if (isMountedRef.current) {
            handleResponse<ResponseType, ErrorResponseType>(
              result,
              onSuccess,
              onError,
            );

            if (!result.status) {
              const err = new Error(result.message ?? 'Request failed');
              setError(err);
              return;
            }

            const newData = dataExtractor(result as ResponseType);
            const totalCount = totalExtractor(result as ResponseType);

            if (append) {
              setData(prevData => [...prevData, ...newData] as TData);
            } else {
              setData(newData);
            }

            setCurrentPage(page);
            setTotal(totalCount);
            setTotalPages(Math.ceil(totalCount / limit));
          }
        } catch (err) {
          const error = err as Error;
          if (isMountedRef.current) {
            setError(error);
            if (onError) {
              onError(error);
            }
          }
        } finally {
          if (isMountedRef.current) {
            if (append) {
              setIsFetchingNextPage(false);
            } else {
              setIsLoading(false);
            }
          }
        }
      },
      [
        enabled,
        serializedParams,
        limit,
        onSuccess,
        onError,
        dataExtractor,
        totalExtractor,
      ],
    );

    const hasNextPage = totalPages !== null && currentPage < totalPages;
    const hasPreviousPage = currentPage > 1;

    const fetchNextPage = useCallback(async () => {
      if (!hasNextPage) return;
      await fetchPage(currentPage + 1, true);
    }, [hasNextPage, currentPage, fetchPage]);

    const fetchPreviousPage = useCallback(async () => {
      if (!hasPreviousPage) return;
      await fetchPage(currentPage - 1, false);
    }, [hasPreviousPage, currentPage, fetchPage]);

    const refetch = useCallback(async () => {
      await fetchPage(currentPage, false);
    }, [currentPage, fetchPage]);

    const reset = useCallback(() => {
      setData([] as unknown as TData);
      setCurrentPage(initialPage);
      setTotalPages(null);
      setTotal(null);
      setError(null);
      void fetchPage(initialPage, false);
    }, [initialPage, fetchPage]);

    useEffect(() => {
      isMountedRef.current = true;

      if (enabled) {
        void fetchPage(initialPage, false);
      }

      return () => {
        isMountedRef.current = false;
      };
    }, [enabled, serializedParams, fetchPage, initialPage]);

    return {
      data,
      currentPage,
      totalPages,
      total,
      hasNextPage,
      hasPreviousPage,
      isLoading,
      isFetchingNextPage,
      error,
      fetchNextPage,
      fetchPreviousPage,
      refetch,
      reset,
    };
  };
}
