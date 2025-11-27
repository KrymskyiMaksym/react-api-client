// Request configuration types
export type RequestConfig = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  requestParams?: Record<string, string>;
};

// Response wrapper type
export type ResponseWrapper<DataType, ErrorsType = unknown> = {
  status: boolean;
  message?: string;
  errors?: ErrorsType;
} & DataType;

// Fetch hook types
export type UseFetchOptions<T> = {
  enabled?: boolean;
  refetchOnMount?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
};

export type UseFetchResult<T> = {
  data: T | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

// Pagination types
export type PaginationParams = {
  page?: number;
  limit?: number;
};

export type UsePaginateOptions<T> = {
  enabled?: boolean;
  initialPage?: number;
  initialLimit?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
};

export type UsePaginateResult<TData extends unknown[]> = {
  data: TData;
  currentPage: number;
  totalPages: number | null;
  total: number | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  error: Error | null;
  fetchNextPage: () => Promise<void>;
  fetchPreviousPage: () => Promise<void>;
  refetch: () => Promise<void>;
  reset: () => void;
};

// Mutation types
export type UseMutationOptions<TData, TVariables> = {
  onMutate?: (variables: TVariables) => void | Promise<void>;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onError?: (error: Error, variables: TVariables) => void | Promise<void>;
  onSettled?: (
    data: TData | null,
    error: Error | null,
    variables: TVariables,
  ) => void | Promise<void>;
};

export type UseMutationResult<TData, TVariables> = {
  data: TData | null;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
};

// HTTP Client abstraction
export interface IHttpClient {
  get<T>(url: string, config?: RequestConfig): Promise<T>;
  request<T>(url: string, config: RequestConfig): Promise<T>;
}

// API Client configuration
export type ApiClientConfig = {
  httpClient: IHttpClient;
  onUnauthorized?: () => void | Promise<void>;
};

// API return types
export type ApiClientReturn<
  ResponseType,
  RequestParamsType,
  ErrorResponseType = unknown,
> = {
  fetch: (
    params?: RequestParamsType,
  ) => Promise<ResponseWrapper<ResponseType, ErrorResponseType>>;
  useFetch: (
    params?: RequestParamsType,
    options?: UseFetchOptions<ResponseWrapper<ResponseType, ErrorResponseType>>,
  ) => UseFetchResult<ResponseWrapper<ResponseType, ErrorResponseType>>;
};

export type ApiMutationReturn<
  ResponseType,
  RequestParamsType,
  ErrorResponseType = unknown,
> = {
  mutate: (
    params?: RequestParamsType,
  ) => Promise<ResponseWrapper<ResponseType, ErrorResponseType>>;
  useMutation: (
    options?: UseMutationOptions<
      ResponseWrapper<ResponseType, ErrorResponseType>,
      RequestParamsType
    >,
  ) => UseMutationResult<
    ResponseWrapper<ResponseType, ErrorResponseType>,
    RequestParamsType
  >;
};

export type ApiPaginateReturn<
  ResponseType,
  RequestParamsType,
  DataArrayType extends unknown[],
  ErrorResponseType = unknown,
> = {
  usePaginate: (
    params?: Omit<RequestParamsType, 'page' | 'limit'>,
    options?: UsePaginateOptions<
      ResponseWrapper<ResponseType, ErrorResponseType>
    >,
  ) => UsePaginateResult<DataArrayType>;
};