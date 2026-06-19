import { getConfig } from './config';
import { ApiError, businessErrorToApiError, toApiError } from './errors';

import type { RequestConfig, ResponseWrapper } from './types';

/**
 * Builds the endpoint URL from a string or function
 */
export function buildEndpoint<RequestParamsType>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  params?: RequestParamsType,
): string {
  if (typeof endpoint === 'function' && typeof params !== 'undefined') {
    return endpoint(params);
  }
  return endpoint as string;
}

type AxiosLikeError<E> = {
  response?: { status: number; data: E };
  message?: string;
};

/**
 * Executes an HTTP request with error handling and response wrapping.
 *
 * Поведение зависит от `throwOnError` в `configureApiClient`:
 * - false (default): возвращает `{ status: true, ... }` либо
 *   `{ status: false, message?, errors? }`. Старое поведение.
 * - true: на HTTP >= 400 / сетевой ошибке / теле с `{ status: false }`
 *   кидает `ApiError`.
 */
export async function executeRequest<
  ResponseType,
  RequestParamsType,
  ErrorResponseType,
>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  fetchConfig: RequestConfig,
  params?: RequestParamsType,
  signal?: AbortSignal,
): Promise<ResponseWrapper<ResponseType, ErrorResponseType>> {
  type RT = ResponseWrapper<ResponseType, ErrorResponseType>;
  const url = buildEndpoint(endpoint, params);
  const config = getConfig();

  try {
    const requestConfig = { ...fetchConfig };
    let response: ResponseType;

    if (
      requestConfig.method?.toUpperCase() === 'GET' ||
      !requestConfig.method
    ) {
      response = await config.httpClient.get<ResponseType>(url, {
        params: {
          ...requestConfig.requestParams,
          ...(params as Record<string, string>),
        },
        signal,
      });
    } else {
      response = await config.httpClient.request<ResponseType>(url, {
        method: requestConfig.method,
        data: {
          ...requestConfig.requestParams,
          ...(params as Record<string, unknown>),
        },
        signal,
      });
    }

    // Бизнес-ошибка: 2xx, но в теле { status: false } (Laravel-style)
    const hasExplicitStatus =
      response &&
      typeof response === 'object' &&
      'status' in (response as object) &&
      typeof (response as unknown as { status: unknown }).status === 'boolean';
    if (
      config.throwOnError &&
      hasExplicitStatus &&
      (response as unknown as { status: boolean }).status === false
    ) {
      throw businessErrorToApiError(response);
    }

    return { ...response, status: true } as RT;
  } catch (e) {
    // Уже наш ApiError — пробрасываем без модификаций
    if (e instanceof ApiError) {
      if (e.status === 401 && config.onUnauthorized) {
        await config.onUnauthorized();
      }
      throw e;
    }

    const error = e as AxiosLikeError<ErrorResponseType>;
    const httpStatus = error.response?.status;

    if (httpStatus === 401 && config.onUnauthorized) {
      await config.onUnauthorized();
    }

    if (config.throwOnError) {
      throw toApiError(e);
    }

    if (error.response?.data) {
      return {
        ...(error.response.data as Record<string, unknown>),
        status: false,
      } as unknown as RT;
    }

    return {
      status: false,
      message: e instanceof Error ? e.message : 'Request error',
    } as unknown as RT;
  }
}

/**
 * Handles response success and error callbacks
 */
export function handleResponse<T, E = unknown>(
  result: ResponseWrapper<T, E>,
  onSuccess?: (data: ResponseWrapper<T, E>) => void,
  onError?: (error: Error) => void,
): void {
  if (result.status && onSuccess) {
    onSuccess(result);
  } else if (!result.status && onError) {
    const err = new Error(result.message ?? 'Request failed');
    onError(err);
  }
}
