# ТЗ: підписка usePaginate() не оновлюється при зміні params — список зависає на скелетоні назавжди

Дата: 2026-08-22
Статус: підтверджено, фікс реалізовано (`src/hooks/use-paginate.ts`), очікує підняття версії/публікації

## Контекст

У `totax-control` (застосунок на цій бібліотеці) екран "Звірка платежів"
(`app/bank-reconciliation/index.tsx`) регулярно зависає на скелетоні
назавжди — список ніколи не показує дані, хоча запит до бекенду успішно
завершується (видно в мережевих логах/на бекенді). Раніше вже було
знайдено й полагоджено один прояв цього класу багів (кнопка ручної
синхронізації використовувала `reset()` замість `refetch()`), але
проблема лишилась ширшою: вона в самому хуку `usePaginate()`, а не в
конкретному застосунку.

## Корінь причини

`src/hooks/use-paginate.ts:128-143`:

```ts
const subscribedPages = isInfinite ? loadedPages : [currentPage];
const subscribedPagesKey = subscribedPages.join(',');
useEffect(() => {
  if (!enabled) return;
  const unsubs = subscribedPages.map(p =>
    cache.subscribe(pageKey(p), rerender),
  );
  return () => {
    for (const u of unsubs) u();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [cache, enabled, subscribedPagesKey, rerender]);
```

`subscribedPagesKey` кодує **лише номери сторінок** (`"1"`, `"1,2"`
тощо) — і нічого про те, ЯКОМУ запиту (`params`) ці сторінки належать.
`pageKey(p)` усередині ефекту фактично залежить від `keyPrefix`
(`src/hooks/use-paginate.ts:90-106`), який змінюється при зміні
`params`/`customKey` — але цієї залежності немає в масиві залежностей
ефекту (навмисно приглушено `eslint-disable-next-line
react-hooks/exhaustive-deps`).

**Наслідок:** коли `params` змінюються (наприклад, фільтр статусу), а
номер сторінки, на якій стоїть компонент, лишається тим самим (типовий
випадок — після зміни фільтра завжди повертає на сторінку 1, і ДО зміни
компонент теж найчастіше стоїть на сторінці 1) — `subscribedPagesKey` не
змінюється, і ефект підписки **не перезапускається**. Підписка
лишається прив'язаною до СТАРОГО запису кешу (старих `params`). Коли
запит під НОВИМИ `params` завершується, `cache.notify(newEntry)`
викликається на записі, у якого `subscribers` — порожня множина: жодних
підписників, жодного ререндеру. Компонент назавжди лишається в стані
`status: 'loading'` / `isLoading: true`, хоча дані вже давно в кеші.

Той самий баг спрацьовує при явному виклику `reset()`
(`src/hooks/use-paginate.ts:358-371`) — він теж скидає `loadedPages`/
`currentPage` до `initialPage`, і якщо компонент і так стояв на
`initialPage`, `subscribedPagesKey` не змінюється так само.

### Чому наявні тести цього не ловлять

`src/__tests__/use-paginate-infinite.test.tsx:77-102`
(`'смена params очищает аккумулятор и грузит первую страницу'`)
**перевіряє саме зміну params — але маскує баг**: перед зміною params
тест викликає `fetchNextPage()`, тож `loadedPages` стає `[1, 2]`
(`subscribedPagesKey = "1,2"`). Після зміни params `loadedPages`
скидається до `[1]` (`subscribedPagesKey = "1"`) — рядок ДІЙСНО
змінюється (`"1,2"` → `"1"`), тому ефект підписки випадково
перезапускається, і тест проходить. Немає жодного тесту на сценарій
"params змінились, АЛЕ множина завантажених сторінок лишилась тією
самою" (найпоширеніший реальний випадок — перше перемикання фільтра,
до будь-якого гортання).

В `src/__tests__/use-paginate.test.tsx` (режим `page`, не `infinite`)
тестів на зміну `params` взагалі немає.

## Мета

1. Компонент, підписаний на `usePaginate()`, коректно отримує
   ререндер, коли дані під НОВИМИ `params` завантажуються — незалежно
   від того, чи збігається номер/множина сторінок зі станом до зміни
   `params`.
2. Те саме для явного `reset()` — підписка не повинна лишатись
   прив'язаною до видаленого запису кешу.
3. Регресійний тест, що ловить САМЕ цей сценарій (params змінились,
   сторінка та сама), у ОБОХ режимах (`page` і `infinite`).

## Не є метою

- Зміна публічного API хука (сигнатури `usePaginate`, форма
  результату) — фікс суто внутрішній.
- Переробка механізму кешування (`QueryClient`/`cache.subscribe`) —
  корінь проблеми локальний до `use-paginate.ts`, а не до самого кешу
  (сам кеш коректно викликає `notify()` на правильному записі; хук
  просто підписаний не туди).

## Дизайн

Додати хеш `keyPrefix` до залежностей ефекту підписки, щоб він
перезапускався і при зміні `params`, і при зміні набору сторінок:

```ts
const keyPrefixHash = useMemo(() => hashQueryKey(keyPrefix), [keyPrefix]);

const subscribedPages = isInfinite ? loadedPages : [currentPage];
const subscribedPagesKey = subscribedPages.join(',');
useEffect(() => {
  if (!enabled) return;
  const unsubs = subscribedPages.map(p =>
    cache.subscribe(pageKey(p), rerender),
  );
  return () => {
    for (const u of unsubs) u();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [cache, enabled, subscribedPagesKey, keyPrefixHash, rerender]);
```

`hashQueryKey` уже експортується з `src/query/key.ts:13` і вже
використовується самим хуком (`keyPrefix`'s `useMemo` на рядку 101).
`eslint-disable-next-line` лишається — `pageKey`/`subscribedPages` як
такі й далі свідомо не в масиві залежностей (вони похідні від уже
включених `keyPrefix`/`loadedPages`/`currentPage`, включати їх напряму
означало б ре-підписку на кожен рендер через нестабільність
`useCallback`-посилання `pageKey`).

Альтернатива — включити сам `keyPrefix` (масив) напряму в масив
залежностей замість хеша: **відхилено**, бо `keyPrefix` — новий масив
на кожен рендер, коли параметри об'єктні (нестабільна ідентичність),
що спричинило б ре-підписку на кожен рендер незалежно від того, чи
справді змінились дані. Хеш (рядок) — стабільне порівняння за
значенням, так само, як і `subscribedPagesKey`.

## Тестування

Спершу RED (дописати тест, переконатись що падає на поточному коді),
потім GREEN (застосувати фікс).

### `src/__tests__/use-paginate-infinite.test.tsx`

Новий тест поруч із наявним `'смена params очищает аккумулятор и
грузит первую страницу'` — той самий сценарій, але БЕЗ проміжного
`fetchNextPage()`, щоб `subscribedPagesKey` лишався незмінним по обидва
боки зміни `params`:

```ts
it('зміна params ЛИШЕ СТОЯЧИ на першій сторінці — компонент отримує нові дані (без проміжного fetchNextPage)', async () => {
  const get = makePagedGet();
  configureApiClient({ httpClient: makeHttpClient(get) });
  const api = apiPaginate<ListResponse, Item[], { q: string }>('/search');

  let snap: UsePaginateResult<Item[]> | null = null;
  let setQ: ((q: string) => void) | null = null;
  function Probe() {
    const [q, sq] = useState('a');
    setQ = sq;
    snap = api.usePaginate({ q }, { initialLimit: 2, mode: 'infinite' });
    return null;
  }
  withProvider(createElement(Probe), client);

  // Стоїмо на сторінці 1 (subscribedPagesKey === "1") — жодного fetchNextPage.
  await waitFor(() => expect(snap?.data.length).toBe(2));
  expect(snap?.data.map(i => i.id)).toEqual([11, 12]);

  act(() => {
    setQ!('b');
  });

  // subscribedPagesKey лишається "1" по обидва боки зміни params —
  // це і є сценарій, який ламався: без фіксу цей waitFor завис би
  // назавжди, бо компонент ніколи не отримує ререндер на завершення
  // запиту під новими params.
  await waitFor(() => expect(snap?.data.length).toBe(2));
  expect(get).toHaveBeenCalledTimes(2);
});
```

**Відхилення від цього плану при реалізації:** цей конкретний
E2E-сценарій НЕ падає на поточному (незафіксованому) коді для
`mode: 'infinite'`, хоча підписка справді лишається на старому записі
кешу (підтверджено інструментальною перевіркою). Причина —
побічний ефект: ефект зміни `params` у `use-paginate.ts:197-203`
викликає `setLoadedPages([initialPage])` — це ЗАВЖДИ новий масив
(інша ідентичність), тож React не може застосувати "eager bail"
оптимізацію `useState` і повторно виконує функцію хука навіть без
робочої підписки; коли пізніше `runFetchPage` викликає
`setCurrentPage(page)` з тим самим значенням, ця повторна робота
чомусь також перестає eager-bail'итись і компонент таки отримує
свіжі дані — попри зламану підписку. Емпірично перевірено, що це не
артефакт синхронного резолву проміса (відтворюється і з реальною
затримкою через `setTimeout`).

Тому реальний тест у `use-paginate-infinite.test.tsx` перевіряє
підписку напряму (white-box) через `client.cache._debugEntries()`:
після зміни `params` новий запис кешу повинен мати підписника
(`subscribers.size === 1`), а старий — жодного (`subscribers.size ===
0`). Цей варіант коректно RED на незафіксованому коді
(`newEntry.subscribers.size === 0`) і GREEN після фіксу. E2E-тест для
`mode: 'page'` (нижче) лишився без змін — там такого маскування немає
(відсутній аналог `setLoadedPages`), і він RED/GREEN-иться саме так,
як описано в плані.

### `src/__tests__/use-paginate.test.tsx`

Дзеркальний тест для режиму `page` (там наразі взагалі немає жодного
тесту на зміну `params`):

```ts
it('зміна params у режимі page — компонент отримує нові дані на тій самій сторінці', async () => {
  const get = vi.fn().mockImplementation(
    (_url: string, cfg: { params: { page: number; q: string } }) =>
      Promise.resolve({
        data: [{ id: cfg.params.q === 'a' ? 1 : 2 }],
        total: 1,
      } as ListResponse),
  );
  configureApiClient({ httpClient: makeHttpClient(get) });
  const api = apiPaginate<ListResponse, { id: number }[], { q: string }>('/search');

  let snapshot: UsePaginateResult<{ id: number }[]> | null = null;
  let setQ: ((q: string) => void) | null = null;
  function Probe() {
    const [q, sq] = useState('a');
    setQ = sq;
    snapshot = api.usePaginate({ q }, { initialLimit: 10 });
    return null;
  }
  withProvider(createElement(Probe), client);

  await waitFor(() => expect(snapshot?.data[0]?.id).toBe(1));

  act(() => {
    setQ!('b');
  });

  // currentPage лишається 1 по обидва боки — без фіксу завис би назавжди.
  await waitFor(() => expect(snapshot?.data[0]?.id).toBe(2));
});
```

### Регресія на існуючі тести

Прогнати повний `vitest` — усі наявні тести (включно з `use-paginate.test.tsx`,
`use-paginate-infinite.test.tsx`, і рештою `src/__tests__/`) мають
лишитись зеленими без змін.

## Випуск

Це опублікований npm-пакет (`@krymskyimaksym/react-api-client`,
поточна версія `2.2.0`, `registry.npmjs.org`), НЕ локальне
`file:`/`link:`-посилання — виправлення в `/Users/admin/Projects/react-native/react-api-client`
саме по собі не потрапить у жоден застосунок, доки не буде:

1. Піднято версію (patch — це виправлення поведінки без зміни
   публічного API: `2.2.0` → `2.2.1`).
2. Зібрано (`yarn build` / `tsup`) і опубліковано (`npm publish` чи
   аналог з наявного `scripts` у `package.json`).
3. Оновлено залежність у `totax-control/package.json` (і в будь-яких
   інших застосунках на цій бібліотеці — **треба окремо перевірити,
   чи є ще споживачі `@krymskyimaksym/react-api-client` крім
   totax-control**, бо цей баг стосується кожного, хто десь передає
   змінні `params` у `usePaginate()`).

## Побічний ефект для totax-control (не входить у це ТЗ, але варто зробити після оновлення пакета)

`app/bank-reconciliation/index.tsx` має три виклики `reset()`
(`useFocusEffect`, `useEffect` на зміну `status`, pull-to-refresh), які
без цього фіксу активно провокували баг. Після оновлення пакета вони
мають запрацювати коректно й без змін — але `useEffect(() => reset(),
[status, reset])` (рядки 75-77) усе одно варто прибрати як
надлишковий: хук і так автоматично скидає й перезапитує дані при зміні
`params` (`serializedParams` у залежностях внутрішнього ефекту
`use-paginate.ts:197-203`) — явний виклик `reset()` тут нічого не додає,
лише зайвий раз видаляє й перестворює запис кешу.
