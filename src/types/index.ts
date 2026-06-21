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

/**
 * Module augmentation для отвязки публичных типов от Laravel-обёртки.
 *
 * Пользователь дополняет этот интерфейс в своём проекте:
 *
 * ```ts
 * declare module '@krymskyimaksym/react-api-client' {
 *   interface Register {
 *     responseShape: 'plain'; // 'laravel' | 'jsonapi' | 'graphql' | 'plain'
 *   }
 * }
 * ```
 *
 * По умолчанию (Register пустой) — `DataOf<T> = ResponseWrapper<T>`,
 * совместимо с 1.x / 2.0.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Register {}

/**
 * Условный тип «форма данных», возвращаемая `fetch` / `useFetch` /
 * `useMutation`. Зависит от `Register['responseShape']`. По умолчанию
 * — `ResponseWrapper<T>` (back-compat).
 */
export type DataOf<T, E = unknown> = Register extends {
  responseShape: infer S;
}
  ? S extends 'plain'
    ? T
    : S extends 'laravel'
      ? ResponseWrapper<T, E>
      : S extends 'jsonapi'
        ? T
        : S extends 'graphql'
          ? T
          : ResponseWrapper<T, E>
  : ResponseWrapper<T, E>;

// Fetch hook types
// TSelected — тип, который вернётся в `data` после применения `select`.
// По умолчанию = T (т.е. полный ответ).
export type UseFetchOptions<T, TSelected = T> = {
  /**
   * При `false`:
   * - запрос НЕ инициируется (ни на mount, ни на focus/reconnect/poll);
   * - но хук **подписан на ключ кэша** и перерисуется, если данные
   *   обновит другой источник (другой `useFetch` с тем же ключом,
   *   `setQueryData` / `invalidateQueries`, мутация, push-handler).
   *
   * То есть `enabled: false` превращает хук в read-only слушателя.
   * Если нужно полностью «потушить» хук — просто не вызывай его.
   *
   * По умолчанию `true`.
   */
  enabled?: boolean;
  refetchOnMount?: boolean;
  /** Refetch при возврате на экран / в браузерное окно. */
  refetchOnFocus?: boolean;
  /** Refetch при возврате приложения в активное состояние (RN AppState). */
  refetchOnAppActive?: boolean;
  /** Refetch при восстановлении сетевого соединения (offline → online). */
  refetchOnReconnect?: boolean;
  /** Время свежести данных в ms. Пока не истечёт — повторный mount берёт из кэша без сети. */
  staleTime?: number;
  /** Сколько держать запись в кэше после ухода последнего подписчика. По умолчанию 5 мин. */
  gcTime?: number;
  /** Интервал поллинга в ms. Поллинг автоматически останавливается, если экран не виден. */
  pollingInterval?: number;
  /**
   * Кастомный queryKey. По умолчанию собирается как
   * `['__endpoint__', endpointString, params]`.
   */
  queryKey?: readonly unknown[];
  /**
   * Селектор результата — пересчитывается мемоизированно.
   * Изменение исходных `data` запускает `select` заново; чтобы избежать
   * лишних ререндеров при равных, но новых по ссылке объектах — задай
   * `selectIsEqual`.
   */
  select?: (data: T) => TSelected;
  /**
   * Сравнение результатов `select` для предотвращения ререндеров.
   * По умолчанию — `Object.is` (референсное равенство).
   * Передавай `shallowEqual`/`deepEqual` для structural-сравнения.
   */
  selectIsEqual?: (a: TSelected, b: TSelected) => boolean;
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

export type UseFetchSelectedResult<TSelected> = {
  data: TSelected | null;
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

export type UsePaginateOptions<T, TData = unknown[], TSelected = TData> = {
  enabled?: boolean;
  initialPage?: number;
  initialLimit?: number;
  /** ms — пока страница свежая, повторный mount берёт её из кэша. */
  staleTime?: number;
  gcTime?: number;
  /**
   * Если true — при смене страницы (или params) предыдущие данные остаются
   * на экране до прихода новых. Полезно для плавной пагинации.
   */
  keepPreviousData?: boolean;
  /** Кастомный префикс ключа кэша. По умолчанию — endpoint + serialized params. */
  queryKey?: readonly unknown[];
  /**
   * Селектор поверх массива страницы. По умолчанию — identity.
   * Применяется к уже извлечённому массиву `TData`.
   */
  select?: (data: TData) => TSelected;
  /** Сравнение результатов `select` для предотвращения ререндеров. По умолчанию `Object.is`. */
  selectIsEqual?: (a: TSelected, b: TSelected) => boolean;
  /**
   * Режим работы:
   * - `'page'` (default) — `data` всегда показывает массив одной
   *   текущей страницы. `fetchNextPage()` заменяет содержимое.
   * - `'infinite'` — `data` накапливает элементы всех загруженных
   *   страниц (page 1 … currentPage). `fetchNextPage()` добавляет
   *   следующую страницу в конец. Подходит для `FlatList.onEndReached`.
   *
   * В infinite-режиме `keepPreviousData` игнорируется (не имеет смысла);
   * `fetchPreviousPage` становится no-op.
   */
  mode?: 'page' | 'infinite';
  /**
   * Только для `mode: 'infinite'`. Идентификатор элемента для
   * дедупликации между страницами. По умолчанию дедупликации нет
   * (элементы из page N и page N+1 присоединяются как есть).
   *
   * @example `(client) => client.id`
   */
  getItemKey?: (item: TData extends Array<infer U> ? U : unknown) =>
    | string
    | number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
};

export type UsePaginateResult<TData> = {
  data: TData;
  currentPage: number;
  totalPages: number | null;
  total: number | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  /** true если данные показываются из предыдущей страницы (keepPreviousData). */
  isPlaceholderData: boolean;
  error: Error | null;
  fetchNextPage: () => Promise<void>;
  fetchPreviousPage: () => Promise<void>;
  /** Префетчит следующую страницу в кэш, не меняя UI. */
  prefetchNextPage: () => Promise<void>;
  refetch: () => Promise<void>;
  reset: () => void;
};

// Mutation types
import type { QueryClient } from '../query/client';
import type { QueryKey } from '../query/key';

export type UseMutationOptions<TData, TVariables, TContext = unknown> = {
  /**
   * Вызывается ДО запроса. Может вернуть context — он попадёт в onError
   * (для rollback) и в onSettled. Используется для optimistic updates:
   * сохранить снепшот → применить оптимистичный setQueryData → в onError
   * вернуть снепшот обратно.
   */
  onMutate?: (
    variables: TVariables,
  ) => void | TContext | Promise<void | TContext>;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined,
  ) => void | Promise<void>;
  onError?: (
    error: Error,
    variables: TVariables,
    context: TContext | undefined,
  ) => void | Promise<void>;
  onSettled?: (
    data: TData | null,
    error: Error | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => void | Promise<void>;
  /**
   * Что инвалидировать в кэше после успешной мутации.
   *
   * Три формы:
   * - `QueryKey[]` — массив префиксов; матч по `matchQueryKey`
   * - `(vars, data) => QueryKey[]` — динамический список префиксов
   * - `(vars, data) => (key: QueryKey) => boolean` — произвольный предикат
   *   по каждому ключу кэша (например «инвалидируй всё, где встречается
   *   этот orderId, в любой позиции ключа»).
   */
  invalidateKeys?:
    | QueryKey[]
    | ((vars: TVariables, data: TData) => QueryKey[])
    | ((vars: TVariables, data: TData) => (key: QueryKey) => boolean);
  /**
   * Точечно патчит кэш после успеха — до invalidate. Удобно для
   * «сервер вернул свежий объект, положим его прямо в ['orders', id]».
   */
  setQueryData?: (
    client: QueryClient,
    variables: TVariables,
    data: TData,
  ) => void;
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
// `signal` опционален: если клиент его игнорирует, поведение
// деградирует до текущего (HTTP-запрос идёт до конца, но кэш игнорирует результат).
export interface IHttpClient {
  get<T>(
    url: string,
    config?: {
      params?: Record<string, unknown>;
      signal?: AbortSignal;
    },
  ): Promise<T>;
  request<T>(
    url: string,
    config: {
      method?: string;
      data?: Record<string, unknown>;
      signal?: AbortSignal;
    },
  ): Promise<T>;
}

/**
 * Колбэки для логирования / отладки. Все опциональны.
 * Пробрасываются в Reactotron / Flipper или просто в console.log.
 * Ошибки в самих колбэках проглатываются — логгер не должен ломать
 * приложение.
 */
export type ApiClientLogger = {
  onFetchStart?: (key: readonly unknown[]) => void;
  onFetchSuccess?: (key: readonly unknown[], data: unknown) => void;
  onFetchError?: (key: readonly unknown[], error: unknown) => void;
  onInvalidate?: (invalidatedHashes: string[]) => void;
  onMutationStart?: (endpoint: string, vars: unknown) => void;
  onMutationSuccess?: (endpoint: string, vars: unknown, data: unknown) => void;
  onMutationError?: (endpoint: string, vars: unknown, error: unknown) => void;
};

// API Client configuration
export type ApiClientConfig = {
  httpClient: IHttpClient;
  onUnauthorized?: () => void | Promise<void>;
  /**
   * Когда true — любая ошибка (HTTP >= 400, сеть, тело с `{ status: false }`)
   * приводит к `throw new ApiError(...)`. По умолчанию false — пакет
   * сохраняет старое поведение (ошибки приходят как `{ status: false }`).
   * Включать только после того, как все вызовы `await *.mutate()` /
   * `await *.fetch()` обёрнуты в try/catch.
   */
  throwOnError?: boolean;
  /** Опциональный логгер для отладки. */
  logger?: ApiClientLogger;
  /**
   * Описывает форму ответа бекенда: как unwrap'ить успех, как
   * детектить бизнес-ошибку в 2xx, как конвертировать в ApiError.
   * Если не задан — встроенный laravel-fallback (`{ status: false }`
   * как признак бизнес-ошибки). См. `adapters.ts`.
   */
  responseAdapter?: import('../adapters').ResponseAdapter;
  /**
   * Дефолтный `staleTime` для всех хуков `useFetch` / `usePaginate`.
   * Если хук задал свой `staleTime` — он перекрывает этот дефолт.
   * Значение по умолчанию `0` (старое поведение — данные сразу stale,
   * каждый mount = новый запрос). Поднимай до `5_000`–`30_000`, чтобы
   * избежать лишних refetch'ей при mount в среднем SPA-сценарии.
   */
  defaultStaleTime?: number;
};

// API return types
export type ApiClientReturn<
  ResponseType,
  RequestParamsType,
  ErrorResponseType = unknown,
> = {
  fetch: (
    params?: RequestParamsType,
  ) => Promise<DataOf<ResponseType, ErrorResponseType>>;
  useFetch: <TSelected = DataOf<ResponseType, ErrorResponseType>>(
    params?: RequestParamsType,
    options?: UseFetchOptions<
      DataOf<ResponseType, ErrorResponseType>,
      TSelected
    >,
  ) => UseFetchResult<TSelected>;
};

export type ApiMutationReturn<
  ResponseType,
  RequestParamsType,
  ErrorResponseType = unknown,
> = {
  mutate: (
    params?: RequestParamsType,
  ) => Promise<DataOf<ResponseType, ErrorResponseType>>;
  useMutation: <TContext = unknown>(
    options?: UseMutationOptions<
      DataOf<ResponseType, ErrorResponseType>,
      RequestParamsType,
      TContext
    >,
  ) => UseMutationResult<
    DataOf<ResponseType, ErrorResponseType>,
    RequestParamsType
  >;
};

export type ApiPaginateReturn<
  ResponseType,
  RequestParamsType,
  DataArrayType extends unknown[],
  ErrorResponseType = unknown,
> = {
  usePaginate: <TSelected = DataArrayType>(
    params?: Omit<RequestParamsType, 'page' | 'limit'>,
    options?: UsePaginateOptions<
      DataOf<ResponseType, ErrorResponseType>,
      DataArrayType,
      TSelected
    >,
  ) => UsePaginateResult<TSelected>;
};
