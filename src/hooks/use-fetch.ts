import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { executeRequest, handleResponse } from '../utils';

import type {
  RequestConfig,
  ResponseWrapper,
  UseFetchOptions,
  UseFetchResult,
} from '../types/index';

/**
 * Hook for fetching data (GET requests)
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

  return (
    params?: RequestParamsType,
    options: UseFetchOptions<RT> = {},
  ): UseFetchResult<RT> => {
    const {
      enabled = true,
      refetchOnMount = true,
      onSuccess,
      onError,
    } = options;

    const [data, setData] = useState<RT | null>(null);
    const [isLoading, setIsLoading] = useState(enabled && refetchOnMount);
    const [isRefetching, setIsRefetching] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const isMountedRef = useRef(true);

    // Serialize params to avoid unnecessary re-renders
    const serializedParams = useMemo(
      () => (params ? JSON.stringify(params) : null),
      [params],
    );

    const fetchData = useCallback(
      async (isRefetch = false) => {
        if (!enabled) return;

        try {
          if (isRefetch) {
            setIsRefetching(true);
          } else {
            setIsLoading(true);
          }
          setError(null);

          const parsedParams = serializedParams
            ? JSON.parse(serializedParams)
            : undefined;

          const result = await executeRequest<
            ResponseType,
            RequestParamsType,
            ErrorResponseType
          >(endpoint, fetchConfig, parsedParams);

          if (isMountedRef.current) {
            setData(result);
            handleResponse<ResponseType, ErrorResponseType>(
              result,
              onSuccess,
              onError,
            );
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
            if (isRefetch) {
              setIsRefetching(false);
            } else {
              setIsLoading(false);
            }
          }
        }
      },
      [enabled, serializedParams, onSuccess, onError],
    );

    const refetch = useCallback(async () => {
      await fetchData(true);
    }, [fetchData]);

    useEffect(() => {
      isMountedRef.current = true;

      if (enabled && refetchOnMount) {
        void fetchData(false);
      }

      return () => {
        isMountedRef.current = false;
      };
    }, [enabled, refetchOnMount, fetchData]);

    return {
      data,
      isLoading,
      isRefetching,
      error,
      refetch,
    };
  };
}
