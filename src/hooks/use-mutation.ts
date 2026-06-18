import { useCallback, useState } from 'react';

import { getQueryClient } from '../query/client';
import { matchQueryKey, type QueryKey } from '../query/key';
import { executeRequest } from '../utils';

import type {
  RequestConfig,
  ResponseWrapper,
  UseMutationOptions,
  UseMutationResult,
} from '../types/index';

/**
 * Hook for mutations (POST/PUT/PATCH/DELETE requests).
 *
 * Фаза 3:
 * - onMutate теперь может вернуть context — он передаётся в onError/onSettled
 *   для rollback.
 * - setQueryData(client, vars, data) — точечный патч кэша после успеха.
 * - invalidateKeys — массив или функция, помечает указанные ключи stale;
 *   подписанные useFetch сами догоняют запросом.
 */
export function createUseMutation<
  ResponseType,
  RequestParamsType,
  ErrorResponseType,
>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  fetchConfig: RequestConfig,
) {
  type RT = ResponseWrapper<ResponseType, ErrorResponseType>;

  return <TContext = unknown>(
    options: UseMutationOptions<RT, RequestParamsType, TContext> = {},
  ): UseMutationResult<RT, RequestParamsType> => {
    const {
      onMutate,
      onSuccess,
      onError,
      onSettled,
      invalidateKeys,
      setQueryData,
    } = options;

    const [data, setData] = useState<RT | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isError, setIsError] = useState(false);

    const reset = useCallback(() => {
      setData(null);
      setError(null);
      setIsLoading(false);
      setIsSuccess(false);
      setIsError(false);
    }, []);

    const applyInvalidate = useCallback(
      (vars: RequestParamsType, result: RT) => {
        if (!invalidateKeys) return;
        const client = getQueryClient();
        const keys =
          typeof invalidateKeys === 'function'
            ? invalidateKeys(vars, result)
            : invalidateKeys;
        if (keys.length === 0) return;
        client.invalidateQueries((k: QueryKey) =>
          keys.some(prefix => matchQueryKey(prefix, k)),
        );
      },
      [invalidateKeys],
    );

    const mutateAsync = useCallback(
      async (variables: RequestParamsType): Promise<RT> => {
        setIsLoading(true);
        setIsSuccess(false);
        setIsError(false);
        setError(null);

        let context: TContext | undefined;

        try {
          if (onMutate) {
            const ctx = await onMutate(variables);
            context = ctx as TContext | undefined;
          }

          const result = await executeRequest<
            ResponseType,
            RequestParamsType,
            ErrorResponseType
          >(endpoint, fetchConfig, variables);

          setData(result);

          if (result.status) {
            setIsSuccess(true);
            // setQueryData — точечный патч кэша
            if (setQueryData) {
              setQueryData(getQueryClient(), variables, result);
            }
            // invalidateKeys — пометить stale и дать подписчикам догнать
            applyInvalidate(variables, result);

            if (onSuccess) {
              await onSuccess(result, variables, context);
            }
          } else {
            const err = new Error(result.message ?? 'Mutation failed');
            setIsError(true);
            setError(err);
            if (onError) {
              await onError(err, variables, context);
            }
          }

          if (onSettled) {
            await onSettled(result, null, variables, context);
          }

          return result;
        } catch (err) {
          const error = err as Error;
          setError(error);
          setIsError(true);
          setIsSuccess(false);

          if (onError) {
            await onError(error, variables, context);
          }
          if (onSettled) {
            await onSettled(null, error, variables, context);
          }

          throw error;
        } finally {
          setIsLoading(false);
        }
      },
      [
        onMutate,
        onSuccess,
        onError,
        onSettled,
        setQueryData,
        applyInvalidate,
      ],
    );

    const mutateSync = useCallback(
      (variables: RequestParamsType) => {
        void mutateAsync(variables);
      },
      [mutateAsync],
    );

    return {
      data,
      error,
      isLoading,
      isSuccess,
      isError,
      mutate: mutateSync,
      mutateAsync,
      reset,
    };
  };
}
