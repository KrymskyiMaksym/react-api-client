# @krymskyimaksym/eslint-plugin-react-api-client

ESLint-правила для [`@krymskyimaksym/react-api-client`](https://www.npmjs.com/package/@krymskyimaksym/react-api-client) (требуется `^2.0.0`).

## Установка

```bash
# npm
npm install -D @krymskyimaksym/eslint-plugin-react-api-client

# yarn
yarn add -D @krymskyimaksym/eslint-plugin-react-api-client

# pnpm
pnpm add -D @krymskyimaksym/eslint-plugin-react-api-client

# bun
bun add -d @krymskyimaksym/eslint-plugin-react-api-client
```

**Peer-зависимости:** `eslint >= 8`, `typescript >= 4.8.4` (опционально),
`@typescript-eslint/utils` (`^6 || ^7 || ^8`). `utils` — peer, чтобы плагин
использовал **ту же** копию, что и парсер потребителя (иначе type-aware
правило падает при рассинхроне utils ↔ parser, напр. utils 6 ↔ parser 8).
Обычно `@typescript-eslint/utils` уже стоит транзитивно вместе с
`@typescript-eslint/parser`; при отдельной установке добавьте явно.

## Подключение

```js
// .eslintrc.js
module.exports = {
  plugins: ['@krymskyimaksym/react-api-client'],
  extends: ['plugin:@krymskyimaksym/react-api-client/recommended'],
};
```

Или вручную:

```js
{
  rules: {
    '@krymskyimaksym/react-api-client/no-await-mutate': 'error',
    '@krymskyimaksym/react-api-client/require-query-key-when-endpoint-is-fn': 'warn',
  }
}
```

## Правила (recommended)

| Rule | Severity | Autofix | Type-aware |
|---|---|---|---|
| `no-await-mutate` | error | — | ✓ |
| `no-non-serializable-params` | error | — | — |
| `require-query-key-when-endpoint-is-fn` | warn | — | — |

## Описание

### `no-await-mutate` (error, type-aware)

Ругается на `await mutate(...)`, когда `mutate` возвращает `void`
(это `useMutation().mutate`) — `await undefined` резолвится сразу и не
ловит ошибки в `try/catch`. Для последовательной логики используй
`mutateAsync`.

Правило **type-aware**: `apiMutation().mutate` возвращает `Promise`, его
`await` корректен, и такой вызов **не репортится**. Автофикса нет — у
`apiMutation().mutate` нет `mutateAsync`, автозамена ломала бы сборку.

```ts
// ❌ useMutation().mutate -> void
const { mutate } = api.useMutation();
await mutate({ id: 1 });

// ✅ mutateAsync -> Promise
await mutateAsync({ id: 1 });

// ✅ apiMutation().mutate -> Promise
await apiMutation('/orders').mutate({ id: 1 });
```

Требует `parserOptions.project`. Без типовой информации правило молча
ничего не репортит (fail-open). Подробнее — [`docs/no-await-mutate.md`](./docs/no-await-mutate.md).

### `require-query-key-when-endpoint-is-fn` (warn)

Если `apiClient`/`apiPaginate` создан с endpoint-функцией, и хук
вызывается без явного `queryKey` в опциях — предупреждение.

```ts
// ❌
const userApi = apiClient((p) => `/users/${p.id}`);
userApi.useFetch({ id: 1 });

// ✅
userApi.useFetch({ id: 1 }, { queryKey: ['user', 1] });
```

При endpoint-функции стабильность ключа зависит от того, что функция
возвращает одну и ту же строку для одних и тех же params. Явный
`queryKey` снимает риск.

### `no-non-serializable-params` (error)

Запрещает функции и `Symbol` в объекте `params`. Они сломают
`hashQueryKey` в рантайме (throw при первом mount):

```ts
// ❌
api.useFetch({ id: 1, cb: () => 1 });
api.useFetch({ tag: Symbol('x') });

// ✅
api.useFetch({ id: 1 });
```

## License

MIT
