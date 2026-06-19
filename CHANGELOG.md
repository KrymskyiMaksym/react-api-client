# Changelog

Все значимые изменения этого пакета документируются здесь.
Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
проект следует [Semantic Versioning](https://semver.org/lang/ru/).

## [2.1.0]

Backend-agnostic режим. Полностью обратно-совместимо.

### Added
- `ResponseAdapter` тип + `configureApiClient({ responseAdapter })`.
- Готовые адаптеры: `laravelAdapter`, `jsonApiAdapter`, `graphqlAdapter`,
  `problemJsonAdapter`, `plainAdapter`.
- `executeRequest` идёт через `responseAdapter.isBusinessError → unwrap`
  при успехе и `responseAdapter.toError` при ошибке. Без адаптера —
  старое Laravel-поведение.
- `interface Register` + `DataOf<T, E>` — module augmentation для
  type-level отвязки от `ResponseWrapper`. Значения `responseShape`:
  `'laravel'` (default), `'plain'`, `'jsonapi'`, `'graphql'`.
- `ApiClientReturn` / `ApiMutationReturn` / `ApiPaginateReturn`
  переключены с `ResponseWrapper<T>` на `DataOf<T>`. Без `Register`
  augmentation поведение типов не меняется.
- README: разделы Laravel / Plain / JSON:API / GraphQL / problem+json /
  собственный адаптер. Раздел Companion packages со ссылками на
  `-devtools` и `eslint-plugin-...`.

### Tests
- +14 тестов на адаптеры (124 всего).

### Backward compatibility
- Без `responseAdapter` поведение runtime и типов идентично 2.0.
- `toApiError` / `businessErrorToApiError` остаются экспортами —
  building-block'и для своих адаптеров.

## [2.0.0]

GA-релиз. Закрыта вся обратная связь из `api-client-feedback-for-author.md`
(категории 1, 2, 3). Никаких изменений в публичном API относительно
2.0.0-beta.3 — только доработки.

### Fixed
- **1.1** Актуализирован JSDoc у `QueryCache.cancelQueries`: с beta.1
  он реально abort'ит HTTP через `AbortSignal`, старый комментарий
  утверждал обратное.

### Added
- **2.1** `selectIsEqual?: (a, b) => boolean` в `UseFetchOptions` —
  предотвращает ререндер при равных по значению, но новых по ссылке
  результатах `select`. По умолчанию `Object.is`.
- **2.2** `configureApiClient({ defaultStaleTime })` — глобальный
  дефолт для `useFetch` / `usePaginate`. По умолчанию `0` (старое
  поведение).
- **2.3** `usePaginate` поддерживает `select` + `selectIsEqual` через
  дженерик `TSelected`. Зеркало `useFetch`.
- **2.5** Расширен JSDoc `prefetchQuery`: явно описано поведение
  `staleTime`, inflight-дедуп, уведомление подписчиков.
- **3.1** `useQuery(key, queryFn, options)` — низкоуровневый аналог
  `useFetch` поверх произвольного `queryFn`. Имя для discoverability
  у мигрантов с TanStack Query.
- **3.2** `client.setQueryData` теперь возвращает новое значение —
  удобно для «пропатчил → передал дальше».
- **3.3** `useQueriesData<[T1, T2, T3]>(keys)` — пакетное чтение
  нескольких ключей с подпиской. Для сценариев типа «бейджи на нижнем баре».
- **3.4** `client.cancelMutations(predicate?)` — отменяет inflight
  мутации через `AbortSignal`. Симметрично `cancelQueries`. Типичный
  кейс — logout.

### Docs
- **1.3** README: блок про подключение `focusManager` / `onlineManager`
  в React Native (через AppState и NetInfo).
- **2.4** README: рекомендация ставить `mutateAsync` первым в
  деструктуризации; `mutate` — короткий fire-and-forget.

## Сателлиты

В этом репо появились два побочных пакета:

- `packages/devtools/` → **`@krymskyimaksym/react-api-client-devtools@0.1.0`**
  - `useCacheSnapshot()` — общий хук (snapshot + summary, подписан на изменения).
  - `CacheDebugScreen` (sub-export `/native`) — React Native экран
    с фильтром и действиями (refetch/invalidate/remove + invalidateAll).
  - `CacheDevtoolsPanel` (sub-export `/web`) — floating-overlay для веба
    в стиле TanStack Devtools.
- `packages/eslint-plugin/` → **`@krymskyimaksym/eslint-plugin-react-api-client@0.1.0`**
  - `no-await-mutate` (error, autofix) — заменяет `.mutate` на `.mutateAsync`.
  - `require-query-key-when-endpoint-is-fn` (warn) — требует явный
    `queryKey` если `apiClient(fn, …)` создан с endpoint-функцией.
  - Конфиг `recommended` подключает оба правила.

Core-пакет не меняется. Подпакеты публикуются независимо.

## [2.0.0-beta.2]

Приоритет 2 + 3 из `api-client-package-improvements.md` (кроме
3.1 React DevTools Panel и 3.4 ESLint-плагин — это отдельные пакеты).

### Added
- **2.1 `refetchQueries(predicate)`** — `QueryCache` сохраняет
  `lastQueryFn` в каждой записи; `client.refetchQueries(['orders'])`
  перезапускает все матчинг запросы без знания queryFn из caller'а.
- **2.2 `useIsFetching` / `useIsMutating`** — хуки для глобального
  индикатора загрузки. Опционально принимают predicate/префикс.
  Реализованы через `cache.subscribeAll` и отдельный `mutationCounter`.
- **2.3 `client.prefetchQuery(key, queryFn, options)`** — `fetchQuery`,
  который не бросает при ошибке. Для оптимистичной подгрузки данных
  следующего экрана.
- **2.4 `invalidateKeys` принимает фабрику предиката** —
  `(vars, data) => (key: QueryKey) => boolean`. Удобно для «инвалидируй
  всё, где встречается этот orderId, в любой позиции ключа».
- **2.5** Покрыто тестом и задокументировано: `invalidateKeys` по
  префиксу `['__paginate__', '/orders']` инвалидирует все страницы
  пагинации одной операцией.
- **3.2 `ApiClientLogger`** — `configureApiClient({ logger: {...} })`.
  Колбэки `onFetchStart/Success/Error`, `onInvalidate`,
  `onMutationStart/Success/Error`. Ошибки внутри колбэков
  проглатываются — логгер не ломает приложение.

### Docs
- **2.6** README: раздел `mutate` vs `mutateAsync` с примерами,
  когда что использовать.
- **3.3** README: SSR/hydrate-паттерн на базе `dehydrate`/`hydrate`.

### Tests
- +13 новых тестов (94 всего, было 81):
  - `refetch-prefetch.test.ts` (4)
  - `use-is-fetching.test.tsx` (3)
  - `logger.test.tsx` (4)
  - `use-mutation.test.tsx` +1 (предикат-фабрика)
  - `use-paginate.test.tsx` +1 (инвалидация всех страниц)

### Backward compatibility
- Все доработки аддитивные. Старый код работает без изменений.

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