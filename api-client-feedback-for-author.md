# Обратная связь автору пакета `@krymskyimaksym/react-api-client`

> Все пункты ниже **не блокируют** миграцию нашего приложения на новый
> кэш-слой — план в `app-migration-plan.md` можно начинать с текущим
> релизом. Это **косметика, типы и DX-улучшения** для доведения пакета
> до идеала.
>
> Версии, к которым относится фидбек:
> - `@krymskyimaksym/react-api-client@2.0.0-beta.3`
> - `@krymskyimaksym/react-api-client-devtools@0.1.0`
> - `@krymskyimaksym/eslint-plugin-react-api-client@0.1.0`

## Категория 1 — баги в типах / документации (исправить до GA)

### 1.1 Устаревший JSDoc у `QueryCache.cancelQueries` ❗

**Файл:** `dist/index.d.ts` (метод `QueryCache.cancelQueries`)

**Что говорит JSDoc сейчас:**

> Сам HTTP-запрос продолжит исполняться (executeRequest не использует
> AbortSignal), но его результат больше не попадёт в кэш и не уведомит
> подписчиков.

**Что по факту в beta.3:**

- `QueryEntry.inflightController: AbortController | null` — есть
- `QueryFn` принимает `{ signal: AbortSignal }`
- `IHttpClient.request/get` принимают `signal?: AbortSignal`

То есть HTTP-запрос **реально отменяется**, если httpClient уважает
signal. Комментарий вводит в заблуждение и говорит обратное.

**Что сделать:**

Переписать JSDoc на актуальное:

```ts
/**
 * Отменяет inflight-запрос: пробрасывает abort через AbortSignal в
 * queryFn (если httpClient его уважает) и отвязывает результат от ключа.
 * Если httpClient игнорирует signal — поведение деградирует: HTTP-запрос
 * продолжит исполняться, но его ответ уже не попадёт в кэш и подписчиков
 * не уведомит.
 *
 * Полезно при размонтировании / переключении страниц.
 */
cancelQueries(predicate: QueryKey | ((key: QueryKey) => boolean)): void;
```

---

### 1.2 Сломанный return type у `<CacheDebugScreen>` в RN-точке входа ❗

**Пакет:** `@krymskyimaksym/react-api-client-devtools@0.1.0`
**Файл:** `dist/native.d.ts`

**Что в типах сейчас:**

```ts
declare function CacheDebugScreen({ scope }?: CacheDebugScreenProps):
  react.DetailedReactHTMLElement<
    react.InputHTMLAttributes<HTMLInputElement>,
    HTMLInputElement
  >;
```

`DetailedReactHTMLElement<HTMLInputElement>` — это **браузерный HTML-тип**,
которого в React Native нет. Это явно артефакт tsup/dts-сборки:
видимо, общий компонент собран один раз и в RN-точку входа улетела
веб-сигнатура.

**Эффект:**

- Рантайм работает (`__DEV__ && <CacheDebugScreen />` рендерится).
- TypeScript ругается при использовании в RN-приложении, либо просит
  кастить через `as unknown as ComponentType`.

**Что сделать:**

Поправить tsup/build конфиг так, чтобы для `native` entry-point тип
возвращался как `JSX.Element` или `ReactElement` (без HTML-привязки).
Скорее всего — отдельный `tsconfig` под нативную сборку без `dom`-libs,
или ручной override типа в исходниках:

```tsx
export function CacheDebugScreen(props?: CacheDebugScreenProps): React.ReactElement {
  // ...
}
```

---

### 1.3 Документация: `focusManager` в React Native — добавить пример в README

**Контекст.**
Пакет не зависит от RN, и `focusManager` в RN надо подключать руками
через `AppState.addEventListener`. В `dist/index.d.ts` это сказано в
JSDoc у `FocusManager`, но в README — нет.

**Что сделать.**

Добавить в README блок:

````md
## React Native

```tsx
import { AppState } from 'react-native';
import { focusManager, onlineManager } from '@krymskyimaksym/react-api-client';

// При запуске приложения
const sub = AppState.addEventListener('change', state => {
  focusManager.setFocused(state === 'active');
});

// Опционально — NetInfo
import NetInfo from '@react-native-community/netinfo';
NetInfo.addEventListener(s => onlineManager.setOnline(!!s.isConnected));
```
````

---

## Категория 2 — UX типов / API (приятно иметь до GA)

### 2.1 Опциональный `isEqual` для `select`

**Контекст.**
`select` пересчитывается мемоизированно. Дефолтная мемоизация — по
референсу (`prev === next`). Для сценариев типа «считаю counters: { new, picking, courier }»
объект на каждый вызов будет новый, и подписчики `useFetch` будут
ререндериться даже если значения по факту те же.

**Что сделать.**

Добавить в `UseFetchOptions`:

```ts
select?: (data: T) => TSelected;
selectIsEqual?: (a: TSelected, b: TSelected) => boolean;
```

По умолчанию — `Object.is`. Пользователь, желающий structural-сравнение,
передаёт свой `isEqual` (или импортирует helper типа
`shallowEqual`/`deepEqual`).

**Альтернатива (без новой опции):** мемоизация по structural equality
по умолчанию для объектов глубины 1. Менее предсказуемо, не советую.

---

### 2.2 Дефолтный `staleTime` — обсудить

**Контекст.**
Сейчас `staleTime` по умолчанию `0` — данные считаются устаревшими
сразу. Это совпадает со старым поведением `useFetch`, но в большинстве
SPA приводит к лишним рефетчам при mount.

**Опции:**

- Оставить `0` — текущее поведение, обратно-совместимо.
- Поднять до `5_000`-`30_000` по умолчанию — лучшее UX в среднем,
  но **breaking change** для тех, кто полагался на «всегда свежий».
- Сделать настраиваемым через `configureApiClient({ defaultStaleTime })`.

**Рекомендация:** добавить `defaultStaleTime` в `configureApiClient`
с дефолтом `0`. Не ломаем никого, но даём проектам легко
переопределить.

---

### 2.3 `usePaginate` поддерживает `select`

**Контекст.**
`useFetch` поддерживает `select` через дженерик `TSelected`.
`usePaginate` — нет (в типах нет ни `TSelected`, ни поля `select`).
Для тех же бейджей по архиву это пригодилось бы.

**Что сделать.**

Расширить `UsePaginateOptions<T, TSelected = T>` с `select?: (data: T) => TSelected`,
и пробросить `TSelected` через `ApiPaginateReturn`. Зеркалит то, что
уже сделали для `useFetch` в beta.1.

---

### 2.4 `mutateAsync` дефолт для `useMutation`

**Контекст.**
ESLint-правило `no-await-mutate` уже защищает от ошибочного
`await api.mutate()`, но это правило, а не типы.

**Что сделать (опционально).**

Поменять рекомендацию в README: ставить `mutateAsync` первым в
деструктуризации, а `mutate` упоминать как «fire-and-forget»:

```tsx
const { mutateAsync, isLoading } = api.useMutation();
// ...
await mutateAsync(vars);
```

Это документация, не код. Снизит количество мест, где правило срабатывает.

---

### 2.5 JSDoc у `prefetchQuery`: указать что подписчики не запускаются

**Файл:** `dist/index.d.ts`, метод `QueryClient.prefetchQuery`

Сейчас JSDoc говорит «кладёт запрос в кэш, не пробрасывая ошибки». Не
сказано:

- учитывает ли он `staleTime` (т.е. если данные свежие — пропускает запрос?)
- что происходит, если уже есть inflight на этот ключ (присоединяется?)
- что происходит с подписчиками — будут ли они уведомлены, когда
  префетч завершится?

**Что сделать.**

Расширить JSDoc, явно описав все три случая. Это критично для
пользователя, который пишет «префетч следующего экрана по long-press».

---

## Категория 3 — DX / расширения (на будущее)

### 3.1 Хук `useQuery` как alias `useFetch`

**Контекст.**
Пользователи, мигрирующие с TanStack Query, ожидают `useQuery`. У нас
он называется `useFetch` (унаследовано с 1.x). Имя «fetch» сбивает —
обычно это HTTP-вызов, а здесь — подписка на кэш.

**Что сделать.**

Экспортировать `useQuery` как алиас:

```ts
export { useFetch as useQuery };
```

Дёшево, повышает discoverability. Старое имя оставить.

---

### 3.2 `setQueryData` принимает Updater с типом

**Текущая сигнатура:**

```ts
setQueryData<T>(key: QueryKey, updater: T | ((prev: T | undefined) => T)): void
```

Это норм. Но если хочется ту же ergonomic, что в TanStack Query — добавить
ещё один overload, который возвращает новое значение из кэша:

```ts
setQueryData<T>(key: QueryKey, updater: ...): T | undefined
```

Удобно для «пропатчил → передал дальше».

Низкий приоритет.

---

### 3.3 Хук `useQueriesData(keys)` для пакетного чтения

**Контекст.**
Для нашего сценария с бейджами:
```tsx
const ordersBoard = useOrdersBoard();
const chatsUnread = useChatsUnread();
const tasksNew = useTasksNew();
```
— три отдельных `useFetch`. Хорошо бы один хук, который читает
несколько ключей синхронно:

```ts
const [orders, chats, tasks] = useQueriesData([
  ['orders', 'board'],
  ['chats', 'unread'],
  ['tasks', 'new'],
]);
```

Не критично, но красивее для шапки/нижнего бара.

---

### 3.4 `QueryClient.cancelMutations`

Симметрично `cancelQueries` — отменить inflight-мутации (например, при
logout'е). Сейчас мутации висят без управления извне.

---

### 3.5 ESLint-плагин: правило `no-fetch-without-key`

**Контекст.**
Сейчас есть `require-query-key-when-endpoint-is-fn`. Хорошо бы ещё
одно: запрет передавать в `useFetch` объект `params` с **функциональными**
полями (callback'и) — это сломает hashKey.

**Что сделать.**

Добавить правило `no-non-serializable-params` (error). Ловит:
- функции в params
- Symbol
- циклические ссылки

---

### 3.6 DevTools: фильтрация по подстроке ключа

В `<CacheDebugScreen>` сейчас можно отдать `scope`. Хорошо бы поверх —
строка поиска прямо в UI, чтобы фильтровать по подстроке (`orders/960`).

Низкий приоритет, но в большом приложении полезно.

---

### 3.7 DevTools: счётчик «X stale, Y fresh, Z inflight» в шапке экрана

`summarizeCache` уже это считает. Просто вывести цветной саммари в UI
поверх таблицы. Зеркалит TanStack DevTools.

---

## Сводно

| Приоритет | Пункты | Время автора |
|---|---|---|
| Категория 1 (баги) | 1.1, 1.2, 1.3 | ~1 час |
| Категория 2 (UX типов) | 2.1, 2.2, 2.3, 2.4, 2.5 | ~3-4 часа |
| Категория 3 (расширения) | 3.1-3.7 | по желанию, ~1 день |

**Минимум до GA:** закрыть Категорию 1 — два бага в типах + дополнить
README блоком про RN.

Категория 2 и 3 — приятные улучшения, можно итерировать после релиза
2.0.0 stable.