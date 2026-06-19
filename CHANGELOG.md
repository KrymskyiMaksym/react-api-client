# Changelog

Все значимые изменения этого пакета документируются здесь.
Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
проект следует [Semantic Versioning](https://semver.org/lang/ru/).

## [2.0.0-beta.1]

Приоритет 1 из `api-client-package-improvements.md` — доработки,
без которых больно мигрировать UI.

### Added
- **1.1 `TSelected` через `apiClient`** — `useFetch<TSelected>(...)`
  выводит тип `data` из `select`. Без any/as:
  `const { data } = api.useFetch(undefined, { select: r => r.count })`.
- **1.2 `toApiError` / `businessErrorToApiError`** — нормализация
  ошибок вынесена в публичные хелперы. `ApiError` passthrough,
  axios-style `{response: {status, data}}`, голый `Error`, и 200 +
  `{ status: false }` — все 4 кейса в одном месте. `executeRequest`
  стал короче и предсказуемее.
- **1.3 AbortSignal в `cancelQueries`** — реальная отмена HTTP:
  - `IHttpClient.get/request` принимают опциональный `signal`.
  - `QueryCache.fetch` создаёт `AbortController` и пробрасывает signal
    в `queryFn(ctx)`. Старая сигнатура `() => Promise<T>` тоже
    принимается.
  - `cancelQueries(predicate)` вызывает `controller.abort()`.
  - `useFetch` отменяет inflight при размонтировании последнего
    подписчика.
  - Если HTTP-клиент игнорирует signal — поведение деградирует до
    текущего (запрос продолжится, но результат не попадёт в кэш).
- **1.4 `persistQueryClient` подписан на изменения** —
  `QueryCache.subscribeAll(listener)`. Persist сам throttle-пишет
  после `setData`/`invalidate`/`remove`/успешного fetch. Ручной
  `persist()` остаётся для logout/shutdown, но в обычном потоке
  не нужен.
- **`enabled: false` = read-only слушатель** — хук не делает запрос,
  но подписан на ключ кэша и перерисуется на `setQueryData` /
  `invalidateQueries` / мутации с тем же ключом. Документировано в
  JSDoc типа `UseFetchOptions.enabled`.

### Tests
- +13 unit/integration тестов (81 всего, было 65):
  - `to-api-error.test.ts` — 9 кейсов на нормализацию ошибок;
  - `abort.test.ts` — signal в queryFn, реальный abort, новый
    controller после cancel;
  - `phase6-persist.test.ts` — auto-persist на `setQueryData`,
    throttle 10 быстрых изменений → одна запись;
  - `enabled-false.test.tsx` — отдаёт из кэша, перерисуется на
    setQueryData снаружи.

### Backward compatibility
- Все доработки — аддитивные. Старые сигнатуры работают как раньше.
- `QueryFn<T>` теперь принимает `ctx: { signal }`, но старая
  `() => Promise<T>` совместима (пакет просто не пробросит signal).

## [2.0.0-beta.0]

### Added
- `CHANGELOG.md` и базовые unit-тесты для текущей публичной поверхности
  (`apiClient`, `apiMutation`, `apiPaginate`, `configureApiClient`) —
  фундамент для дальнейшей перестройки на QueryCache без потери обратной
  совместимости (см. `api-client-upgrade-plan.md`, Фаза 0).
- **Query Cache core** (Фаза 1): `QueryCache`, `QueryClient`,
  `hashQueryKey`/`matchQueryKey`, `getQueryClient`/`setQueryClient`.
  Покрыт unit-тестами: dedupe inflight-промисов, `staleTime`, подписка
  по ключу, invalidate по префиксу, GC через `gcTime`, точечный
  `setQueryData`.
- **React-интеграция** (Фаза 2):
  - `<ApiClientProvider client?={QueryClient}>` + `useQueryClient()`.
  - `useFetch` переписан поверх `QueryCache`: одинаковые `queryKey`
    разделяют один результат и один inflight-promise. Старая сигнатура
    `{ data, isLoading, isRefetching, error, refetch }` сохранена.
  - Новые опции `useFetch`: `staleTime`, `gcTime`, `refetchOnFocus`,
    `refetchOnAppActive`, `pollingInterval`, `queryKey`, `select`.
  - Поллинг автоматически паузится при `focusManager.setFocused(false)`.
  - `focusManager` — singleton: в браузере подписывается на window focus
    и visibilitychange; в React Native — потребитель пробрасывает
    `AppState` через `focusManager.setFocused(state === 'active')`.
  - `invalidateQueries(...)` извне (push-handler) — подписанные хуки
    сами догоняют запросом, без ручного `refetch()`.
- **Мутации с инвалидацией** (Фаза 3):
  - `useMutation`: `invalidateKeys` (массив или `(vars, data) => keys`) —
    после успеха помечает соответствующие ключи stale, подписанные
    `useFetch` сами догоняют.
  - `useMutation`: `setQueryData(client, vars, data)` — точечный патч кэша
    до инвалидации, без round-trip.
  - `onMutate` теперь может вернуть `context` — он передаётся в
    `onSuccess`/`onError`/`onSettled` (для optimistic updates с rollback).
  - `useMutation` принимает `<TContext>` дженерик.
- **Унифицированные ошибки** (Фаза 3.5):
  - Класс `ApiError<E>` с полями `status`, `code`, `errors`,
    `isNetworkError`, `isUnauthorized`, `isValidationError`, `raw`.
    Стабильный `instanceof` после транспиляции.
  - Флаг `configureApiClient({ throwOnError: true })`. По умолчанию
    `false` — поведение пакета не меняется.
  - При `throwOnError: true`:
    - HTTP ≥ 400 → `throw ApiError`
    - сеть/таймаут → `throw ApiError` с `isNetworkError: true`
    - 2xx с `{ status: false }` → `throw ApiError` (бизнес-ошибка Laravel)
    - 2xx с `{ status: true }` или без поля `status` → resolve как обычно
  - `onUnauthorized` продолжает вызываться при 401 в обоих режимах.
  - Покрыто 10 unit-тестами: 4xx, 5xx, network, `{ status: false }`,
    200 OK, instanceof, бэкап-режим без флага.
- **Пагинация поверх кэша** (Фаза 4):
  - `usePaginate` переписан на `QueryCache`: каждая страница хранится
    под отдельным подключом `[...prefix, { page, limit }]`. Возврат на
    ранее открытую страницу — мгновенно из кэша, без сети.
  - Новые опции: `staleTime`, `gcTime`, `keepPreviousData`, `queryKey`.
  - Новые поля результата: `isPlaceholderData`, `prefetchNextPage()`.
  - `reset()` теперь чистит весь префикс пагинации в кэше.
  - 3 интеграционных теста: первичная загрузка, кэш страниц при навигации
    вперёд/назад, prefetchNextPage без смены currentPage.
- **Сетевая интеграция** (Фаза 5):
  - `onlineManager` (синглтон). В браузере подписывается на window
    online/offline. В React Native — потребитель пробрасывает NetInfo
    через `onlineManager.setOnline(!!state.isConnected)`. Жёсткой
    зависимости от NetInfo нет.
  - `useFetch` опция `refetchOnReconnect`.
  - `queryClient.cancelQueries(predicate)` — отвязывает inflight: HTTP
    продолжит идти, но результат не попадёт в кэш и не уведомит подписчиков.
- **Persistence** (Фаза 6):
  - `persistQueryClient({ client, storage, throttleMs, allowList, maxAge, version })`.
  - Storage-адаптер совместим с AsyncStorage / expo-secure-store.
  - `dehydrate` сохраняет только success-записи. `hydrate` восстанавливает
    данные сразу как stale → фоновый refetch.
  - `version` + `maxAge` — автоматическая инвалидация устаревших снэпшотов.
  - Throttle по таймеру + dedupe по сериализованному значению.
- **DevTools** (Фаза 7):
  - `inspectCache(cache)` — снимок по каждой записи (status, isStale,
    subscribers, hasInflight, errorMessage).
  - `summarizeCache(cache)` — сводка для логов.
  - `invalidateAll(client)` — пометить весь кэш как stale.

## [1.0.0]

- Первый публичный релиз: `apiClient`, `apiMutation`, `apiPaginate`,
  `configureApiClient`, хуки `useFetch`, `useMutation`, `usePaginate`.