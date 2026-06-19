import { ApiError } from './errors';

/**
 * Описывает «как мы общаемся с бекендом»: как распаковывать успешный
 * ответ, как детектить бизнес-ошибку в 2xx-ответе и как конвертировать
 * сырое тело в `ApiError`.
 *
 * Передаётся один раз в `configureApiClient({ responseAdapter })`.
 * Все три поля опциональны: дефолты дают Laravel-поведение (обратная
 * совместимость с 1.x / 2.0).
 */
export type ResponseAdapter<TRaw = unknown, TUnwrapped = unknown> = {
  /**
   * Распаковать 2xx-ответ в данные для caller'а. Вызывается ровно один
   * раз сразу после получения тела, ДО записи в кэш и ДО `select`.
   * По умолчанию — identity.
   */
  unwrap?: (raw: TRaw) => TUnwrapped;

  /**
   * Является ли 2xx-ответ бизнес-ошибкой (Laravel `{status: false}`,
   * GraphQL `{ errors: [...] }`, и т.п.). Если true — пакет вызовет
   * `toError` и кинет `ApiError` вместо resolve.
   * По умолчанию — `(r) => r?.status === false` (Laravel).
   */
  isBusinessError?: (raw: TRaw) => boolean;

  /**
   * Сконвертировать сырое тело в `ApiError`. Вызывается для:
   * - HTTP ≥ 400
   * - 2xx + `isBusinessError === true`
   * - сетевая ошибка / таймаут (`httpStatus = 0`)
   *
   * По умолчанию — текущий маппинг (`message`/`code`/`errors`).
   */
  toError?: (raw: unknown, httpStatus: number) => ApiError;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** Laravel-стиль: `{ status: false, message, errors }`. Default. */
export const laravelAdapter: ResponseAdapter = {
  isBusinessError: r =>
    isObject(r) && (r as { status?: unknown }).status === false,
  toError: (r, http) => {
    const body = isObject(r) ? r : undefined;
    return new ApiError({
      message:
        (body && typeof body.message === 'string'
          ? body.message
          : undefined) ?? `HTTP ${http}`,
      status: http,
      code: body && typeof body.code === 'string' ? body.code : undefined,
      errors: body?.errors,
      isUnauthorized: http === 401,
      isValidationError: http === 422 || (body?.errors !== undefined),
      raw: r,
    });
  },
};

/** JSON:API. `unwrap` отдаёт `r.data`, ошибки — массив в `r.errors`. */
export const jsonApiAdapter: ResponseAdapter = {
  unwrap: (r: unknown) => (isObject(r) ? r.data : r),
  isBusinessError: r =>
    isObject(r) && Array.isArray(r.errors) && r.errors.length > 0,
  toError: (r, http) => {
    const errors = isObject(r) && Array.isArray(r.errors) ? r.errors : [];
    const first = isObject(errors[0]) ? errors[0] : undefined;
    return new ApiError({
      message:
        (first && typeof first.detail === 'string' ? first.detail : undefined) ??
        (first && typeof first.title === 'string' ? first.title : undefined) ??
        `HTTP ${http}`,
      status: http,
      code: first && typeof first.code === 'string' ? first.code : undefined,
      errors,
      isUnauthorized: http === 401,
      isValidationError: http === 422,
      raw: r,
    });
  },
};

/** GraphQL. `unwrap` отдаёт `r.data`, ошибки в `r.errors`. */
export const graphqlAdapter: ResponseAdapter = {
  unwrap: (r: unknown) => (isObject(r) ? r.data : r),
  isBusinessError: r =>
    isObject(r) && Array.isArray(r.errors) && r.errors.length > 0,
  toError: (r, http) => {
    const errors = isObject(r) && Array.isArray(r.errors) ? r.errors : [];
    const first = isObject(errors[0]) ? errors[0] : undefined;
    return new ApiError({
      message:
        (first && typeof first.message === 'string'
          ? first.message
          : undefined) ?? `HTTP ${http}`,
      status: http,
      errors,
      isUnauthorized: http === 401,
      raw: r,
    });
  },
};

/** RFC 7807 problem+json. Бизнес-ошибок в 2xx не бывает — только HTTP. */
export const problemJsonAdapter: ResponseAdapter = {
  isBusinessError: () => false,
  toError: (r, http) => {
    const body = isObject(r) ? r : undefined;
    return new ApiError({
      message:
        (body && typeof body.title === 'string' ? body.title : undefined) ??
        (body && typeof body.detail === 'string' ? body.detail : undefined) ??
        `HTTP ${http}`,
      status: http,
      code: body && typeof body.type === 'string' ? body.type : undefined,
      isUnauthorized: http === 401,
      isValidationError: http === 422,
      raw: r,
    });
  },
};

/** Plain REST: никаких бизнес-ошибок в 2xx, identity unwrap. */
export const plainAdapter: ResponseAdapter = {
  isBusinessError: () => false,
  toError: (r, http) => {
    const body = isObject(r) ? r : undefined;
    return new ApiError({
      message:
        (body && typeof body.message === 'string'
          ? body.message
          : undefined) ?? `HTTP ${http}`,
      status: http,
      isUnauthorized: http === 401,
      isNetworkError: http === 0,
      raw: r,
    });
  },
};
