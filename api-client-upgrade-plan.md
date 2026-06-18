# План обновления `@krymskyimaksym/react-api-client`

> Цель: довести пакет до уровня, на котором можно строить экраны редизайна
> (мгновенные переходы заказа между вкладками, актуальные счётчики на табах,
> синхронизация деталей и списков, обновление по push) **без обвешивания
> каждого компонента ручным `refetch` и без дублирования данных между хуками**.

## 1. Где мы сейчас

Текущая поверхность API пакета (по `dist/index.d.ts`):

- `apiClient(endpoint, config)` → `{ fetch, useFetch }`
- `apiMutation(endpoint, config)` → `{ mutate, useMutation }`
- `apiPaginate(endpoint, config, options)` → `{ usePaginate }`
- `configureApiClient({ httpClient, onUnauthorized })` — глобальная настройка

Каждый `useFetch`/`usePaginate` держит **свою независимую копию данных**:
- два компонента, вызывающие `managerOrdersApi.useFetch()`, делают два разных
  запроса и хранят два разных `data`
- кэша между вызовами нет
- инвалидации по ключу нет — после мутации компонент сам обязан знать, какие
  `refetch()` дёрнуть
- нет подписки «обновился заказ #960 → перерендерись» — обновление приходит
  только тому компоненту, который явно вызвал `refetch()`
- нет background-refetch при возврате в foreground / при фокусе экрана
  (есть `useFocusEffect` в потребителях, но это ручная работа)
- ошибки представлены `Error`, но в API нет нормализованного типа ошибки/статуса

Это совместимо со старым UI «таб = отдельный запрос», но **ломается** в новом
дизайне, где:
- бейджи на нижнем баре должны отражать суммарные счётчики из тех же данных,
  что и списки
- мутация в карточке заказа должна мгновенно отражаться во всех списках
- открытие заказа из чата и из списка — это одна и та же сущность
- push-уведомление должно точечно обновлять один заказ, не сбрасывая ленту

## 2. Что хотим получить

Поверх существующих `apiClient/apiMutation/apiPaginate` добавить **кэш-слой
с инвалидацией по ключу** так, чтобы:

1. Несколько `useFetch` одного и того же запроса делили **один результат**
   и один in-flight-promise (dedupe).
2. Мутация могла **точечно инвалидировать** один или несколько ключей кэша,
   и подписанные хуки сами перезапустят запрос (или возьмут из кэша).
3. Можно вручную «вписать» данные в кэш по ключу (`setQueryData`), чтобы
   применять серверный ответ мутации без лишнего round-trip.
4. Поддерживается **stale-while-revalidate**: возвращаем устаревшие данные
   мгновенно, в фоне рефетчим, перерисовываем при свежих.
5. Есть **focus-refetch** и **app-state-refetch** из коробки (без копипасты
   `useFocusEffect` в каждом списке).
6. Есть **window-/screen-level enable**: автоматически останавливаем
   поллинг/рефетч, если экран не виден.
7. Опциональный **polling interval** на хук.
8. Опциональные **optimistic updates** для мутаций через `onMutate` с
   нормальным rollback.
9. **Унифицированная обработка ошибок через `throw`** — любая ошибка
   (сетевая, HTTP ≥ 400, бизнес-логика бекенда с `status: false`) должна
   ловиться через `try/catch` или попадать в `error` / `onError`. Сейчас
   бизнес-ошибки приходят как обычный ответ с `{ status: false }` и **не
   отличаются от успеха** на уровне промиса — `useFetch.error` остаётся
   `null`, caller обязан проверять `response.status` вручную. См. 3.7.

> Намеренно НЕ цель: реплицировать TanStack Query целиком. Берём минимум,
> который покрывает наши кейсы, и не больше — чтобы пакет остался лёгким.

## 3. Решение, которое предлагаю

### 3.1 Глобальный QueryCache (in-memory)

Внутри пакета — Map от ключа к записи:

```ts
type QueryKey = readonly unknown[]; // ['orders', 'manager', { sort: 'date' }]

type CacheEntry<T> = {
  data: T | undefined;
  error: Error | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  updatedAt: number;
  subscribers: Set<() => void>;     // подписчики (rerender)
  inflight: Promise<T> | null;      // dedupe
  staleTime: number;                // ms
  gcTime: number;                   // ms — когда чистить, если 0 подписчиков
};
```

Сериализация ключа — стабильный JSON (со стабильной сортировкой объектов).

### 3.2 Новый хук `useFetch` (расширение существующего)

API остаётся обратно-совместимым. Добавляются опции:

```ts
useFetch(params, {
  enabled,
  refetchOnMount,                  // уже есть
  refetchOnFocus,                  // NEW — refetch при возврате на экран
  refetchOnAppActive,              // NEW — refetch при выходе из background
  staleTime,                       // NEW — ms (default 0)
  gcTime,                          // NEW — ms (default 5 * 60_000)
  pollingInterval,                 // NEW — ms; пауза если экран не виден
  queryKey,                        // NEW — кастомный ключ кэша; по умолчанию
                                   //   собирается из endpoint+params
  onSuccess, onError,              // уже есть
  select,                          // NEW — селектор; пересчёт мемоизируется
})
```

Поведение:
- При маунте — берём из кэша. Если `data` есть и не stale → отдаём, рендеримся,
  ничего не запрашиваем.
- Если stale или нет — запускаем запрос (или присоединяемся к inflight).
- Подписываемся на ключ. На размонтировании — отписываемся; если подписчиков
  стало 0 — через `gcTime` запись удаляется.
- При фокусе/возврате в foreground — `refetch()` если просрочено.

### 3.3 Новый хук `useMutation` — добавляем инвалидацию

```ts
useMutation({
  onMutate,                  // уже есть; теперь может вернуть rollback
  onSuccess,                 // уже есть
  onError,                   // уже есть
  onSettled,                 // уже есть
  invalidateKeys,            // NEW — string[] | (vars, data) => string[]
  setQueryData,              // NEW — (cache, vars, data) => void
                             //   точечно правит кэш после успеха
})
```

После успеха:
1. Вызывается `setQueryData` (если задан) — патч кэша.
2. Вызывается `invalidateKeys` → каждый матчинг-ключ помечается stale и
   запускается background refetch если есть подписчики.

### 3.4 Внешние хелперы

Экспортируем функции, которыми можно дергать кэш из любого места (например,
из push-handler'а):

```ts
queryClient.invalidateQueries(keyOrPredicate)
queryClient.setQueryData(key, updater)
queryClient.getQueryData(key)
queryClient.refetchQueries(keyOrPredicate)
queryClient.removeQueries(keyOrPredicate)
```

`queryClient` — singleton, инициализируется внутри `configureApiClient` (или
отдельным `createQueryClient`). Для тестов — можно создавать несвязанный
инстанс и пробрасывать через провайдер.

### 3.5 React-интеграция

`<ApiClientProvider client={queryClient}>` оборачивает root приложения.
В лагерь к существующему `configureApiClient` добавляется `queryClient`.
Хуки достают клиент через React Context. На фокус/app state подписывается
**сам Provider** один раз, а не каждый хук.

### 3.7 Обработка ошибок — `throwOnError` в `configureApiClient`

Сейчас любой ответ сервера (даже `{ status: false }`) **резолвится через
`.then`**. Это означает, что:

- `try { await mutate() } catch (e)` не ловит бизнес-ошибки — только сеть
- `useFetch.error` остаётся `null` при бизнес-ошибке
- каждый caller обязан помнить `if (!response.status) ...`, забыл — баг
- общий error boundary / toast невозможен

**Решение — флаг в глобальном конфиге** (а не в каждом
`apiClient`/`apiMutation`):

```ts
configureApiClient({
  httpClient: http,
  onUnauthorized: () => ...,
  throwOnError: true,  // NEW — по умолчанию false
});
```

Когда `throwOnError: true`:
- HTTP ≥ 400 → `throw new ApiError(...)`
- HTTP 2xx с `{ status: false }` → тоже `throw new ApiError(...)` (для
  совместимости с текущим Laravel-форматом, см. ниже)
- HTTP 2xx с `{ status: true }` или без поля `status` → resolve как обычно
- сеть / таймаут → `throw new ApiError({ isNetworkError: true })`

Класс ошибки:

```ts
class ApiError<E = unknown> extends Error {
  status: number;            // HTTP code (или 0 для сетевой)
  code?: string;             // app-specific (например 'PAYMENT_LOCKED')
  errors?: E;                // payload from server (validation map etc.)
  isNetworkError: boolean;
  isUnauthorized: boolean;   // 401
  isValidationError: boolean;// 422 или { errors: {...} } в теле
  raw: unknown;              // оригинальный response — на случай если
                             // legacy-код хочет старое поведение
}
```

**Backward compatibility:**

- По умолчанию `throwOnError: false` → старое поведение сохраняется,
  ничего не ломается. Существующие места без `try/catch` продолжают
  работать как раньше.
- Включается на проекте **одним местом** в `configureApiClient(...)`
  в `app/_layout.tsx`. Но **только после** того, как все вызовы
  `await xxxApi.mutate()` и `await xxxApi.fetch()` обёрнуты в `try/catch`
  или мигрированы на хуки с `onError`.
- Поэтапная миграция: грепом найти все `await` + `.mutate(`/`.fetch(`,
  обернуть в `try/catch`, потом включить флаг глобально.
- После включения флага никаких `if (!response.status)` проверок в
  caller'ах больше не нужно — это становится анти-паттерном.

**В `useFetch` / `useMutation`:**

При `throwOnError: true`:
- `useFetch.error: ApiError | null` — заполняется
- `useMutation`: `onError(error: ApiError, vars)` срабатывает на любую
  ошибку, включая бизнес-ошибку
- `mutate()` rejects → `try/catch` работает

При `throwOnError: false` (старое поведение): ровно как сейчас, `error`
заполняется только на сетевую ошибку.

**Acceptance criteria для этой части:**

- [ ] `configureApiClient({ throwOnError: true })` включает новое поведение
- [ ] Без флага — поведение пакета не меняется (регресс-тесты)
- [ ] `ApiError` экспортируется из пакета, у него стабильное `instanceof`
- [ ] `useFetch.error` и `useMutation.error` — типизированы как
      `ApiError | null` (когда флаг включён)
- [ ] Покрыто тестами: 4xx, 5xx, network error, `{ status: false }`, 200 OK

### 3.8 Что НЕ ломаем

- Существующий публичный API: `apiClient`, `apiMutation`, `apiPaginate`,
  `configureApiClient`, `useFetch`, `useMutation`, `usePaginate`.
- Текущие потребители (`ManagerOrdersList`, `BaseOrdersList`, etc.) продолжают
  работать без изменений.
- Новые опции и хуки — opt-in.

## 4. Дорожная карта

### Фаза 0 — стабилизация репозитория пакета

1. Перенести пакет в этот проект как локальный workspace (если ещё не),
   либо клонировать его рядом, чтобы можно было итеративно публиковать.
2. Завести `CHANGELOG.md` и semver.
3. Покрыть текущий `useFetch`/`useMutation`/`usePaginate` базовыми unit-тестами
   на jest+react-testing-library, чтобы не сломать обратную совместимость.

### Фаза 1 — Query Cache core (без React)

1. Сериализация ключей (stable JSON, обработка функций и symbol → throw).
2. `QueryCache` класс: `get/set/subscribe/unsubscribe/invalidate/remove`.
3. `QueryClient` — высокоуровневый фасад над `QueryCache` с теми же методами,
   что и в 3.4.
4. Dedupe inflight-промисов по ключу.
5. Unit-тесты: одновременные запросы, инвалидация, GC после отписки.

### Фаза 2 — React-интеграция

1. `ApiClientProvider`, `useQueryClient()` хук.
2. Переписать внутренности `useFetch` на работу через `QueryCache`:
   - сохранить старый возвращаемый тип `{ data, isLoading, isRefetching, error, refetch }`
   - добавить новые опции (`staleTime`, `refetchOnFocus`, `pollingInterval`,
     `queryKey`, `select`)
3. Глобальные слушатели:
   - AppState (RN) → `focusManager.setFocused(state === 'active')`
   - Provider пушит «focus» событие, подписанные хуки делают refetch если
     stale
4. Регресс-тесты на старое поведение.

### Фаза 3 — Mutations с инвалидацией

1. В `useMutation` добавить `invalidateKeys`, `setQueryData`.
2. Поддержка optimistic updates: `onMutate` возвращает `context`, `onError`
   получает его для rollback.
3. Документация: рецепты для типичных кейсов
   (`confirmOrder → invalidate ['orders']`).

### Фаза 3.5 — Унифицированные ошибки (`throwOnError`)

Можно вести параллельно Фазе 3, но включать флаг **только после** Фазы 3.

1. Класс `ApiError` со всеми полями из 3.7.
2. В `httpClient`-обёртке (или внутри пакета) — конверсия HTTP/тела в
   `ApiError`, когда `throwOnError: true`.
3. Включить в `configureApiClient` поле `throwOnError`.
4. Обновить типы `useFetch`/`useMutation` так, чтобы `error` был
   `ApiError | null` при включённом флаге.
5. Регресс-тесты для старого поведения (`throwOnError: false`).
6. Миграционный гайд для приложения:
   - грепом найти `await *Api.mutate(`, `await *Api.fetch(`
   - обернуть в `try/catch` или перевести на хук с `onError`
   - убрать `if (!response.status)` проверки
   - **последним шагом** включить `throwOnError: true` глобально

### Фаза 4 — Пагинация

1. Перевести `apiPaginate` на тот же кэш (страницы под отдельными подключами).
2. `keepPreviousData` для гладкой пагинации.
3. `prefetchNextPage` хелпер.

### Фаза 5 — Сетевая интеграция

1. Опциональный `refetchOnReconnect` через `NetInfo` (если установлен).
   Без жёсткой зависимости — если пакет недоступен, опция игнорируется.
2. `queryClient.cancelQueries(key)` — для отмены inflight на размонтировании.

### Фаза 6 — Persistence (опционально, под чаты/архив)

1. Адаптер `persistQueryClient({ storage, throttleMs, allowList })`.
2. Можно использовать `expo-secure-store` или `@react-native-async-storage`.
3. Гидратация при старте приложения.

### Фаза 7 — DevTools (опционально)

Минимальный inspect через консоль / debug-экран:
- список ключей в кэше
- кто подписан
- inflight статус
- кнопка «invalidate all»

## 5. Что от этого получит наше приложение

После Фазы 2–3 уже хватит, чтобы реализовать заявленный сценарий:

| Сценарий | Сейчас | После |
|---|---|---|
| Подтвердил заказ → переход Manager → Picker | руками `refetch` в обоих местах | `invalidateKeys: ['orders']`, все списки обновятся сами |
| Открыл деталь, поменял оплату | при возврате — focusEffect + refetch | `setQueryData(['orders', id], patch)` + `invalidateKeys: ['orders', 'board']`, список и карточка синхронны |
| Push «order_updated» | дергает навигацию | `queryClient.invalidateQueries(['orders', id])` + `['orders', 'board']` |
| Бейджи на табах | свои `useFetch` на счёт | `useFetch(boardKey, { select: (d) => counts(d) })`, один источник |
| Поллинг `/orders/board` каждые 30с | нет | `pollingInterval: 30_000`, авто-пауза при background |
| Параллельные одинаковые запросы | два запроса | dedupe, один |

## 6. Открытые вопросы

1. **Где живёт пакет?** Нужно решить: монорепо/workspace, или сабмодуль, или
   так и публикуем npm-релизами. От этого зависит, как итерировать (можно ли
   быстро править и пересобирать без релиза).
2. **Зависимость от React Native?** Сейчас пакет нейтральный. AppState и
   NetInfo живут в RN. Делаем их **опциональными адаптерами**, чтобы пакет
   оставался изоморфным.
3. **`select` мемоизация.** По умолчанию — referential equality результата;
   если потребитель хочет structural — пусть передаёт свой `isEqual`.
4. **Глобальный или per-screen клиент?** Скорее всего глобальный (один на
   приложение), но Provider всё равно нужен — для тестов и storybook.
5. **Размер бандла.** Текущий пакет крошечный. После Фазы 1-2 вырастет
   на ~3-5 KB gzipped (estimated). Это нормально, но фиксируем как метрику.
6. **Миграция существующих экранов.** Опциональна и постепенна. Старый код
   продолжает работать. Сначала переводим экран `/orders` нового дизайна,
   проверяем эффект, потом — остальное.

## 7. Acceptance criteria для перехода к редизайну

Можно начинать переписывать UI заказов, когда выполнены **Фаза 0 + 1 + 2 + 3**.
Конкретно — реализованы и работают:

- [ ] Два `useFetch` с одинаковым ключом разделяют один запрос и один кэш
- [ ] `staleTime > 0`: повторный mount возвращает данные мгновенно, без сети
- [ ] `refetchOnFocus`: вернулся на экран после блокировки телефона → данные
      обновились без ручного `refetch`
- [ ] `useMutation({ invalidateKeys })`: после успешной мутации указанные
      ключи помечаются stale и подписанные хуки обновляются
- [ ] `setQueryData`: точечное обновление кэша работает и триггерит
      перерендер подписчиков
- [ ] `pollingInterval` с автостопом при background
- [ ] `queryClient.invalidateQueries(['orders', 960])` извне (например, из
      push-handler'а) обновляет и список, и карточку
- [ ] `configureApiClient({ throwOnError: true })` включает throw на любую
      ошибку (HTTP ≥ 400, network, `{ status: false }`); без флага старое
      поведение полностью сохраняется
- [ ] `ApiError` доступен для `instanceof` проверок и содержит исходный
      response в `raw`

## 8. Что НЕ входит в этот план

- Перевод UI на новый кэш — отдельная работа, она пойдёт пакетами по экранам
  после Фазы 3.
- Замена существующих эндпоинтов (`/orders/board`, новые роуты) — это план
  на стороне бекенда, не пакета.
- WebSocket / SSE realtime — поверх кэша делается отдельным транспортом,
  который дергает `queryClient.setQueryData` / `invalidateQueries`. Пакет
  для этого менять не нужно.
