import { executeRequest } from './utils';

import { createUseFetch, createUseMutation, createUsePaginate } from './hooks';

import type {
  ApiClientReturn,
  ApiMutationReturn,
  ApiPaginateReturn,
  RequestConfig,
  ResponseWrapper,
} from './types';

/**
 * Creates an API client for GET requests
 * @param endpoint - URL string or function that generates URL from params
 * @param fetchConfig - Request configuration
 * @returns Object with fetch method and useFetch hook
 *
 * @example
 * const userApi = apiClient<User, { id: string }>('/api/users/:id')
 * const { data } = userApi.useFetch({ id: '123' })
 */
function apiClient<
  ResponseType = void,
  RequestParamsType = void,
  ErrorResponseType = unknown,
>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  fetchConfig: RequestConfig = {},
): ApiClientReturn<ResponseType, RequestParamsType, ErrorResponseType> {
  type RT = ResponseWrapper<ResponseType, ErrorResponseType>;

  const fetch = async (params?: RequestParamsType): Promise<RT> => {
    return executeRequest<ResponseType, RequestParamsType, ErrorResponseType>(
      endpoint,
      fetchConfig,
      params,
    );
  };

  const useFetch = createUseFetch<
    ResponseType,
    RequestParamsType,
    ErrorResponseType
  >(endpoint, fetchConfig);

  return { fetch, useFetch };
}

/**
 * Creates an API client for mutation requests (POST/PUT/PATCH/DELETE)
 * @param endpoint - URL string or function that generates URL from params
 * @param fetchConfig - Request configuration
 * @returns Object with mutate method and useMutation hook
 *
 * @example
 * const createUserApi = apiMutation<User, CreateUserRequest>('/api/users', { method: 'POST' })
 * const { mutate, isLoading } = createUserApi.useMutation()
 */
function apiMutation<
  ResponseType = void,
  RequestParamsType = void,
  ErrorResponseType = unknown,
>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  fetchConfig: RequestConfig = {},
): ApiMutationReturn<ResponseType, RequestParamsType, ErrorResponseType> {
  type RT = ResponseWrapper<ResponseType, ErrorResponseType>;

  const mutate = async (params?: RequestParamsType): Promise<RT> => {
    return executeRequest<ResponseType, RequestParamsType, ErrorResponseType>(
      endpoint,
      fetchConfig,
      params,
    );
  };

  const useMutation = createUseMutation<
    ResponseType,
    RequestParamsType,
    ErrorResponseType
  >(endpoint, fetchConfig);

  return { mutate, useMutation };
}

/**
 * Creates an API client for paginated requests.
 *
 * Каждая страница хранится в кэше под собственным подключом
 * `['__paginate__', endpoint, params, { page, limit }]`. Это значит, что
 * мутация может одной операцией пометить stale **все страницы** списка:
 *
 * ```ts
 * confirmOrder.useMutation({
 *   invalidateKeys: [['__paginate__', '/orders/archive']],
 * });
 * ```
 *
 * Префикс матчится по `matchQueryKey` → подключи каждой страницы тоже
 * считаются совпадающими.
 *
 * @param endpoint - URL string or function that generates URL from params
 * @param fetchConfig - Request configuration
 * @param options - Pagination options (data/total extractors)
 * @returns Object with usePaginate hook
 *
 * @example
 * const usersApi = apiPaginate<UsersResponse, User[], { search?: string }>('/api/users')
 * const { data, fetchNextPage, hasNextPage } = usersApi.usePaginate()
 */
function apiPaginate<
  ResponseType extends { data: TData; total?: number; page?: number },
  TData extends unknown[],
  RequestParamsType = void,
  ErrorResponseType = unknown,
>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  fetchConfig: RequestConfig = {},
  options?: {
    dataExtractor?: (response: ResponseType) => TData;
    totalExtractor?: (response: ResponseType) => number;
  },
): ApiPaginateReturn<
  ResponseType,
  RequestParamsType,
  TData,
  ErrorResponseType
> {
  const usePaginate = createUsePaginate<
    ResponseType,
    TData,
    RequestParamsType,
    ErrorResponseType
  >(endpoint, fetchConfig, options);

  return { usePaginate };
}

export default apiClient;
export { apiMutation, apiPaginate };

// Export configuration
export { configureApiClient, getConfig, isConfigured } from './config';

// Унифицированные ошибки (Фаза 3.5 + 1.2)
export { ApiError, toApiError, businessErrorToApiError } from './errors';
export type { ApiErrorInit } from './errors';

// Global state hooks
export { useIsFetching, useIsMutating } from './hooks';

// Query cache layer (Phase 1 + 2)
export {
  QueryCache,
  QueryClient,
  getQueryClient,
  setQueryClient,
  hashQueryKey,
  matchQueryKey,
  focusManager,
  onlineManager,
  ApiClientProvider,
  useQueryClient,
  persistQueryClient,
  inspectCache,
  invalidateAll,
  summarizeCache,
} from './query';
export type {
  FetchOptions,
  QueryFn,
  QueryKey,
  QueryState,
  QueryStatus,
  ApiClientProviderProps,
  DehydratedQuery,
  DehydratedState,
  PersistOptions,
  PersistStorage,
  CacheEntrySnapshot,
} from './query';

// Re-export types for convenience
export type {
  ResponseWrapper,
  UseFetchOptions,
  UseFetchResult,
  UseMutationOptions,
  UseMutationResult,
  UsePaginateOptions,
  UsePaginateResult,
  ApiClientConfig,
  ApiClientLogger,
  IHttpClient,
} from './types';
