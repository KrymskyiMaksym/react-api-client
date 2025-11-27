import { getConfig } from './config';

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

/**
 * Executes an HTTP request with error handling and response wrapping
 */
export async function executeRequest<
  ResponseType,
  RequestParamsType,
  ErrorResponseType,
>(
  endpoint: string | ((arg0: RequestParamsType) => string),
  fetchConfig: RequestConfig,
  params?: RequestParamsType,
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
      });
    } else {
      response = await config.httpClient.request<ResponseType>(url, {
        method: requestConfig.method,
        data: {
          ...requestConfig.requestParams,
          ...(params as Record<string, unknown>),
        },
      });
    }

    return { ...response, status: true } as RT;
  } catch (e) {
    const error = e as {
      response?: { status: number; data: ErrorResponseType };
    };

    if (error.response?.status === 401 && config.onUnauthorized) {
      await config.onUnauthorized();
    }

    if (error.response?.data) {
      return {
        ...(error.response.data as Record<string, unknown>),
        status: false,
      } as unknown as RT;
    }

    return {
      status: false,
      message: error instanceof Error ? error.message : 'Request error',
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
