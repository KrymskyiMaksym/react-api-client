# `no-await-mutate`

Запрещает `await` над вызовом `mutate(...)`, который возвращает `void`.

## Почему

В `@krymskyimaksym/react-api-client` есть **два разных** `mutate` с
противоположным контрактом:

| Источник | Тип `.mutate` | `await` осмыслен? | Есть `mutateAsync`? |
| --- | --- | --- | --- |
| `useMutation()` → `UseMutationResult` | `(vars) => void` | **нет** | да |
| `apiMutation(...)` → `ApiMutationReturn` | `(params?) => Promise<Data>` | **да** | нет |

- `useMutation().mutate` — «fire-and-forget»: возвращает `void`. `await` над ним
  ничего не ждёт (`await undefined` резолвится сразу), поэтому последовательная
  логика и `try/catch` не сработают. Для этого есть `mutateAsync`, который
  возвращает `Promise<TData>`.
- `apiMutation().mutate` — наоборот, **возвращает `Promise`**. Его `await`
  корректен, и `mutateAsync` у него нет. Такой вызов правило **не трогает**.

## Как работает правило

Правило **type-aware**: оно смотрит на тип результата вызова `.mutate(...)`.

- тип — `Promise`-подобный (есть метод `then`) → **не репортит**
  (это `apiMutation().mutate`);
- тип — `void`/`undefined` → **репортит** (это `useMutation().mutate`).

Матчатся оба написания: `await obj.mutate(...)` и `await mutate(...)`
(после `const { mutate } = useMutation()`).

Автофикса нет намеренно: у `apiMutation().mutate` нет `mutateAsync`, и
автозамена `mutate` → `mutateAsync` ломала бы сборку.

## Требования

Правило требует типовой информации:

```jsonc
// .eslintrc
{
  "parserOptions": {
    "project": "./tsconfig.json"
  }
}
```

Если типовая информация недоступна (нет `parserOptions.project`), правило
**молча ничего не репортит** (fail-open), чтобы не давать ложных срабатываний.

## Примеры

```ts
// ❌ useMutation().mutate возвращает void
const { mutate } = api.useMutation();
await mutate({ id: 1 });

// ✅ используйте mutateAsync
const { mutateAsync } = api.useMutation();
await mutateAsync({ id: 1 });

// ✅ apiMutation().mutate возвращает Promise — await корректен
await apiMutation('/orders').mutate({ id: 1 });
```
