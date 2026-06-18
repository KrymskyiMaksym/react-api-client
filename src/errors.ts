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
