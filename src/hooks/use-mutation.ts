import { useCallback, useState } from 'react';

import { executeRequest } from '../utils';

import type {
  RequestConfig,
  ResponseWrapper,
  UseMutationOptions,
  UseMutationResult,
} from '../types/index';

/**
 * Hook for mutations (POST/PUT/PATCH/DELETE requests)
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

  return (
    options: UseMutationOptions<RT, RequestParamsType> = {},
  ): UseMutationResult<RT, RequestParamsType> => {
    const { onMutate, onSuccess, onError, onSettled } = options;

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

    const mutateAsync = useCallback(
      async (variables: RequestParamsType): Promise<RT> => {
        setIsLoading(true);
        setIsSuccess(false);
        setIsError(false);
        setError(null);

        try {
          // onMutate callback
          if (onMutate) {
            await onMutate(variables);
          }

          const result = await executeRequest<
            ResponseType,
            RequestParamsType,
            ErrorResponseType
          >(endpoint, fetchConfig, variables);

          setData(result);

          if (result.status) {
            setIsSuccess(true);
            // onSuccess callback
            if (onSuccess) {
              await onSuccess(result, variables);
            }
          } else {
            const err = new Error(result.message ?? 'Mutation failed');
            setIsError(true);
            setError(err);
            // onError callback
            if (onError) {
              await onError(err, variables);
            }
          }

          // onSettled callback (always called)
          if (onSettled) {
            await onSettled(result, null, variables);
          }

          return result;
        } catch (err) {
          const error = err as Error;
          setError(error);
          setIsError(true);
          setIsSuccess(false);

          // onError callback
          if (onError) {
            await onError(error, variables);
          }

          // onSettled callback (always called)
          if (onSettled) {
            await onSettled(null, error, variables);
          }

          throw error;
        } finally {
          setIsLoading(false);
        }
      },
      [onMutate, onSuccess, onError, onSettled],
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
