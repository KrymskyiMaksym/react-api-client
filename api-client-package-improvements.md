# Доработки пакета `@krymskyimaksym/react-api-client`

> Базовая версия — `2.0.0-beta.0`. Она закрыла фундамент (QueryCache,
> подписки, инвалидация, focus/online managers, persistence, throwOnError).
> Этот документ — про **прицельные доработки**, выявленные при разборе
> поставки и при попытке мигрировать наше приложение
> (см. `app-migration-plan.md`).
>
> Каждый пункт — независимый. Можно брать по одному.

## Приоритет 1 — без этого больно мигрировать UI

### 1.1 Протолкнуть `TSelected` через `apiClient`/`apiPaginate`

**Проблема.**
В `UseFetchOptions<T, TSelected = T>` дженерик `TSelected` есть, но
обёртка `apiClient(...)` его не пробрасывает наружу:

```ts
type ApiClientReturn<ResponseType, RequestParamsType, ErrorResponseType = unknown> = {
  useFetch: (
    params?: RequestParamsType,
    options?: UseFetchOptions<ResponseWrapper<ResponseType, ErrorResponseType>>
    //                                          ^^^ TSelected не выведен
  ) => UseFetchResult<ResponseWrapper<ResponseType, ErrorResponseType>>;
  //                  ^^^ всегда полный response, а не TSelected
};
```

Из-за этого в нашем сценарии «бейджи на нижнем баре через `select`»
типизация не работает — `data` остаётся типом полного ответа, и нужно
кастить.

**Что сделать.**

```ts
type ApiClientReturn<ResponseType, RequestParamsType, ErrorResponseType = unknown> = {
  fetch: (params?: RequestParamsType) =>
    Promise<ResponseWrapper<ResponseType, ErrorResponseType>>;
  useFetch: <TSelected = ResponseWrapper<ResponseType, ErrorResponseType>>(
    params?: RequestParamsType,
    options?: UseFetchOptions<
      ResponseWrapper<ResponseType, ErrorResponseType>,
      TSelected
    >,
  ) => UseFetchResult<TSelected>;
};
```

То же — для `usePaginate` (если там тоже планируется `select`).

**Acceptance.**

```ts
const ordersApi = apiClient<OrdersListResponse>('/orders');
const { data } = ordersApi.useFetch(undefined, {
  select: (r) => r.data.length, // тип данных — number
});
// data: number | null  ← без any/as
```

---

### 1.2 Нормализация ошибок в пакете (готовность к `throwOnError`)

**Проблема.**
HTTP-клиенты в проектах (включая наш `lib/fetch/http-client-adapter.ts`)
часто кидают **plain object** `{ response: { status, data } }`, а не
`Error`. Когда включаем `throwOnError: true`, пакет должен **сам**
сконвертировать всё это в `ApiError` — иначе будет утечка реализации
http-клиента в код пользователя.

**Что сделать.**

В `executeRequest` (там, где пакет ловит throw от `httpClient.request`):

```ts
function toApiError(thrown: unknown, fallbackBody?: unknown): ApiError {
  // 1. Уже ApiError — пробрасываем
  if (thrown instanceof ApiError) return thrown;

  // 2. Стандартный axios-style { response: { status, data } }
  if (isObject(thrown) && 'response' in thrown && isObject(thrown.response)) {
    const r = thrown.response as { status: number; data?: any };
    return new ApiError({
      message: r.data?.message ?? `HTTP ${r.status}`,
      status: r.status,
      code: r.data?.code,
      errors: r.data?.errors,
      isNetworkError: r.status === 0,
      isUnauthorized: r.status === 401,
      isValidationError: r.status === 422,
      raw: r.data,
    });
  }

  // 3. Чистый Error
  if (thrown instanceof Error) {
    return new ApiError({
      message: thrown.message,
      status: 0,
      isNetworkError: true,
      raw: thrown,
    });
  }

  // 4. Неизвестный объект
  return new ApiError({
    message: 'Unknown error',
    status: 0,
    raw: thrown ?? fallbackBody,
  });
}
```

И — если тело **успешного** 2xx содержит `{ status: false }`:

```ts
if (response && typeof response === 'object' && 'status' in response &&
    response.status === false) {
  throw new ApiError({
    message: response.message ?? 'Request failed',
    status: 200,
    code: response.code,
    errors: response.errors,
    isValidationError: !!response.errors,
    raw: response,
  });
}
```

**Acceptance.**

- [ ] При `throwOnError: true`, любой throw от http-клиента превращается
      в `ApiError` (с заполненными полями) ещё до того, как попадёт в
      caller / `error` / `onError`.
- [ ] 200 + `{ status: false }` тоже превращается в `ApiError`.
- [ ] `instanceof ApiError` — единственная проверка, нужная в caller'е.
- [ ] Регресс: при `throwOnError: false` ничего не меняется.

---

### 1.3 AbortSignal в `cancelQueries`

**Проблема.**
Сейчас `cancelQueries` только отвязывает inflight-промис от ключа —
сам HTTP-запрос продолжает гонять. Для редизайна (живой поиск
клиентов, переключение вкладок при поллинге) хочется реальной отмены.

**Что сделать.**

1. В `IHttpClient.request(url, config)` принять опциональный `signal: AbortSignal`.
2. В `QueryEntry` хранить `abortController: AbortController | null`.
3. `cancelQueries` — вызывает `abortController.abort()` для каждой
   matching-записи.
4. На размонтировании `useFetch` — если был последним подписчиком и
   запрос ещё inflight, тоже `abort()`.
5. Документация: «если httpClient игнорирует signal, поведение
   деградирует до текущего».

**Acceptance.**

- [ ] Запустил `useFetch` с тяжёлым endpoint → размонтировал компонент →
      в network DevTools видно `cancelled`, а не «продолжающийся».
- [ ] `queryClient.cancelQueries(['orders'])` отменяет реально, не
      только декларативно.

---

### 1.4 Подписка persist на изменения

**Проблема.**
Сейчас `persistQueryClient` персистит **только по throttle-таймеру**.
Нет события «кэш изменился» — значит, форс-`persist()` надо звать
из мутаций руками. Это утечка деталей реализации в caller'а.

**Что сделать.**

1. В `QueryCache` — отдельный канал событий `onAnyChange(listener)` /
   `subscribeAll(listener)`. Триггерится при `setData`, `invalidate`,
   `remove`, переходе `status`.
2. `persistQueryClient` подписывается на этот канал и сам ставит
   throttle-таймер на запись. Внешнего ручного `persist()` после каждой
   мутации больше не нужно.
3. `persist()` остаётся доступным для критичных моментов (logout, перед
   фоновым шатдауном приложения).

**Acceptance.**

- [ ] Поправил данные через `setQueryData` → через `throttleMs` запись
      сама уехала в storage. Никаких ручных вызовов.
- [ ] Не хочу персистить — задал `allowList`, фильтрует, остальное
      не сохраняется.

---

## Приоритет 2 — улучшения, без которых жить можно

### 2.1 Типизированный `queryClient.refetchQueries`

Сейчас комментарий в коде говорит: «refetchQueries требует, чтобы либо
подписчик сам перезапустил запрос, либо чтобы вызвали fetchQuery с
queryFn вручную». Это неудобно — нет одного метода «обнови всё
матчинг-ключи прямо сейчас».

**Что сделать.**
Регистрировать `queryFn` в `QueryEntry` при первом `fetch` (хук
передаёт его при подписке). Тогда `refetchQueries(predicate)` сможет:

1. Найти матчинг записи
2. Если у них есть подписчики — вызвать `cache.fetch(key, registeredFn, { force: true })`
3. Если подписчиков нет — пропустить (или принять опциональный
   `queryFnByKey`)

**Acceptance.**
- [ ] `await client.refetchQueries(['orders'])` — все подписанные запросы
      перезапросились, без подсказок от хуков.

---

### 2.2 Хелперы `useIsFetching` / `useIsMutating`

Для глобального индикатора загрузки в шапке:

```ts
const isFetching = useIsFetching(); // number — сколько активных
const isMutating = useIsMutating(['orders']); // только заказы
```

Реализуются через `subscribe` на кэш + счётчик inflight. Полезны для
толлбара/спиннера на экране в стиле GitHub/Linear.

**Acceptance.**
- [ ] Полоска прогресса в шапке появляется, пока есть хоть один
      inflight запрос; пропадает, когда всё спокойно.

---

### 2.3 `queryClient.prefetchQuery`

Сейчас есть `fetchQuery`. Часто нужна вариация «положи в кэш, но не
бросай, если упадёт» — для оптимистичной подгрузки данных следующего
экрана при наведении/долгом тапе.

```ts
client.prefetchQuery(key, queryFn, options); // не бросает
```

Внутри — обёртка над `fetchQuery` с `.catch(() => {})`.

---

### 2.4 `invalidateKeys` принимает предикат

Сейчас `invalidateKeys: QueryKey[] | ((vars, data) => QueryKey[])`. Иногда
удобнее одной функцией матчить — типа «инвалидируй всё, где ключ
содержит этот orderId».

```ts
invalidateKeys: QueryKey[]
  | ((vars: TVariables, data: TData) => QueryKey[])
  | ((vars: TVariables, data: TData) => (key: QueryKey) => boolean);
```

Не критично, но дешёво в реализации.

---

### 2.5 `usePaginate` + `invalidateKeys`/`setQueryData`

Сейчас инвалидация ключей мутации работает с обычным кэшем. Страницы
пагинации лежат под подключами — стоит явно задокументировать, что
`invalidateKeys: [['orders', 'archive']]` пометит **все страницы**
архива как stale (через `matchQueryKey` по префиксу). Если это уже так
— достаточно документации; если нет — реализовать.

---

### 2.6 Маркировка `mutate` как `void` vs `mutateAsync` как `Promise`

Сейчас оба возвращают разные типы (правильно). Но в типах нет
строгого запрета вызвать `mutate(vars)` с `await` (получишь `void`).
Хорошо бы:

```ts
mutate: (vars) => void; // как есть
mutateAsync: (vars) => Promise<TData>; // как есть
```

+ ESLint-правило/пример в README: «`await api.mutate(...)` —
анти-паттерн, используй `mutateAsync`». Это документация, не код.

---

## Приоритет 3 — DX / debug / nice-to-have

### 3.1 React DevTools Panel

Опциональный пакет-сателлит `react-api-client-devtools` с UI:

- список ключей в кэше + inflight статус + подписчики
- кнопки `invalidate` / `remove` / `refetch`
- timeline мутаций

Можно — отдельным пакетом, чтобы не тащить в прод.

### 3.2 Логгер для отладки

```ts
configureApiClient({
  ...,
  logger: {
    onFetchStart: (key) => ...,
    onFetchSuccess: (key, data) => ...,
    onFetchError: (key, err) => ...,
    onInvalidate: (keys) => ...,
  },
});
```

Удобно подключить к Reactotron / Flipper.

### 3.3 SSR / hydrate API

Сейчас `dehydrate/hydrate` есть. Для веб-проектов было бы полезно
явно описать паттерн: серверный `dehydrate` → `<script>window.__DATA__</script>`
→ `hydrate` на клиенте. Это документация.

### 3.4 ESLint-плагин `react-api-client`

Правила:
- запрет `await xxx.mutate()` если включён `throwOnError`
- предупреждение «здесь стоит указать `queryKey`, потому что endpoint —
  функция от params»
- проверка, что `invalidateKeys` содержит существующие ключи (по
  списку зарегистрированных endpoint'ов)

Не блокер, но снижает шанс ошибиться.

---

## Что я НЕ предлагаю менять

- Поломать обратную совместимость с 1.x. Все доработки — аддитивные.
- Сделать пакет монолитом «всё включено». DevTools/ESLint — сателлиты.
- Тащить tanstack-query внутрь как зависимость.
- Реализовывать realtime-транспорт (WS/SSE). Это поверх пакета.

---

## Acceptance для всего приоритета 1

Эти 4 пункта (1.1-1.4) — необходимый набор для **полной миграции
нашего приложения** на новый кэш-слой. После них можно идти по
`app-migration-plan.md` без дополнительных хаков.

- [ ] `select` корректно типизирован через `apiClient`
- [ ] Любая ошибка снаружи приходит уже как `ApiError`, при включённом
      `throwOnError`
- [ ] `cancelQueries` реально отменяет HTTP
- [ ] `persistQueryClient` подписан на изменения и не требует ручного
      `persist()` после каждой мутации

---

## Открытые вопросы к автору пакета

1. **`select` мемоизация.** По дефолту — referential equality или
   structural? Принимать `isEqual` через опции — да/нет?
2. **`focusManager` в RN.** Стоит ли вообще пихать в пакет «опциональный
   адаптер» под RN AppState, или оставить как «подключайте сами»? Сейчас
   подключают сами — это нормально.
3. **Какой `staleTime` дефолт.** Сейчас неявный 0. Если поставить
   30 секунд по умолчанию — будет лучше для большинства SPA, но это
   breaking-change в поведении кэша.
4. **`enabled: false` поведение.** Сейчас, видимо, просто не запускает
   запрос. А если ключ уже в кэше — отдаёт его? Стоит проверить и
   зафиксировать в JSDoc.