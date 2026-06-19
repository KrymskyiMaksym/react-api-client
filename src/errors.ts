/**
 * Унифицированная ошибка API. Кидается из `executeRequest` (а значит,
 * из `fetch`/`mutate`/хуков) только когда в `configureApiClient` включён
 * `throwOnError: true`. По умолчанию поведение пакета не меняется —
 * ошибки приходят как `{ status: false }` (см. CHANGELOG, Фаза 3.5).
 */
export type ApiErrorInit<E = unknown> = {
  message: string;
  status: number;
  code?: string;
  errors?: E;
  isNetworkError?: boolean;
  isUnauthorized?: boolean;
  isValidationError?: boolean;
  raw?: unknown;
};

export class ApiError<E = unknown> extends Error {
  readonly status: number;
  readonly code?: string;
  readonly errors?: E;
  readonly isNetworkError: boolean;
  readonly isUnauthorized: boolean;
  readonly isValidationError: boolean;
  readonly raw: unknown;

  constructor(init: ApiErrorInit<E>) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.errors = init.errors;
    this.isNetworkError = init.isNetworkError ?? false;
    this.isUnauthorized = init.isUnauthorized ?? init.status === 401;
    this.isValidationError =
      init.isValidationError ??
      (init.status === 422 || (init.errors !== undefined && init.errors !== null));
    this.raw = init.raw;
    // корректный prototype chain для instanceof после транспиляции
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/**
 * Конвертация произвольного throw'нутого значения в `ApiError`.
 * Покрывает 4 кейса:
 * - `ApiError` → passthrough
 * - axios-like `{ response: { status, data } }` → ApiError с полями из data
 * - `Error` (сетевая ошибка, таймаут) → ApiError(isNetworkError, status: 0)
 * - неизвестный объект → ApiError(message: 'Unknown error', status: 0)
 */
export function toApiError(thrown: unknown): ApiError {
  if (thrown instanceof ApiError) return thrown;

  if (isObject(thrown) && 'response' in thrown && isObject(thrown.response)) {
    const r = thrown.response as { status?: number; data?: unknown };
    const status = typeof r.status === 'number' ? r.status : 0;
    const data = isObject(r.data) ? r.data : undefined;
    const message =
      (data && typeof data.message === 'string' ? data.message : undefined) ??
      (thrown instanceof Error ? thrown.message : undefined) ??
      `HTTP ${status}`;
    return new ApiError({
      message,
      status,
      code: data && typeof data.code === 'string' ? data.code : undefined,
      errors: data?.errors as unknown,
      isNetworkError: status === 0,
      isUnauthorized: status === 401,
      isValidationError: status === 422 || data?.errors !== undefined,
      raw: r.data ?? thrown,
    });
  }

  if (thrown instanceof Error) {
    return new ApiError({
      message: thrown.message,
      status: 0,
      isNetworkError: true,
      raw: thrown,
    });
  }

  return new ApiError({
    message: 'Unknown error',
    status: 0,
    raw: thrown,
  });
}

/**
 * Для 2xx ответа, в теле которого Laravel-style `{ status: false }`.
 * Возвращает ApiError(status: 200, ...). Вызывается из executeRequest
 * только при `throwOnError: true`.
 */
export function businessErrorToApiError(response: unknown): ApiError {
  if (!isObject(response)) {
    return new ApiError({ message: 'Request failed', status: 200, raw: response });
  }
  return new ApiError({
    message:
      typeof response.message === 'string' ? response.message : 'Request failed',
    status: 200,
    code: typeof response.code === 'string' ? response.code : undefined,
    errors: response.errors,
    isValidationError: response.errors !== undefined,
    raw: response,
  });
}
