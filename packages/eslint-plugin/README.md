# @krymskyimaksym/eslint-plugin-react-api-client

ESLint-правила для [`@krymskyimaksym/react-api-client`](../..).

## Установка

```bash
npm i -D @krymskyimaksym/eslint-plugin-react-api-client
```

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

## Правила

### `no-await-mutate` (error, autofix)

`mutate(...)` возвращает `void`. `await api.mutate(...)` отдаст
`undefined` и не поймает ошибки в `try/catch`. Для последовательной
логики или try/catch используй `mutateAsync`.

```ts
// ❌
await api.mutate({ id: 1 });

// ✅
await api.mutateAsync({ id: 1 });
```

Autofix меняет `.mutate` на `.mutateAsync`.

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

## License

MIT
