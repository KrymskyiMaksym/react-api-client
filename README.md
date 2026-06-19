# @krymskyimaksym/react-api-client

A lightweight, type-safe API client for React and React Native with built-in hooks for queries, mutations, and pagination.

## Features

- 🎯 **Type-Safe**: Full TypeScript support with generic types
- 🪝 **React Hooks**: Built-in hooks for easy data fetching
- 📦 **Lightweight**: Zero dependencies (except React)
- 🔄 **Flexible**: Works with any HTTP client (fetch, axios, etc.)
- 🚀 **Modern**: ESM and CJS support
- 🎨 **Customizable**: Inject your own HTTP client and error handlers

## Installation

```bash
# npm
npm install @krymskyimaksym/react-api-client

# yarn
yarn add @krymskyimaksym/react-api-client

# pnpm
pnpm add @krymskyimaksym/react-api-client

# bun
bun add @krymskyimaksym/react-api-client
```

Опциональные сателлиты — ставятся отдельно по необходимости:

```bash
# DevTools (cache inspector для RN и web)
npm install -D @krymskyimaksym/react-api-client-devtools

# ESLint-плагин (no-await-mutate с autofix и др.)
npm install -D @krymskyimaksym/eslint-plugin-react-api-client
```

**Peer-зависимости:** `react >= 16.8`. Для RN — установи `react-native`
обычным способом (используется опционально, через `try/catch`).

**Node:** требуется `>= 18`.

## Quick Start

### 1. Configure the API Client

First, configure the global API client with your HTTP client and error handlers:

```typescript
import { configureApiClient } from '@krymskyimaksym/react-api-client';
import { router } from 'expo-router'; // or your router

// Create your HTTP client instance
const httpClient = {
  async get(url, config) {
    const response = await fetch(url);
    return response.json();
  },
  async request(url, config) {
    const response = await fetch(url, {
      method: config.method,
      body: JSON.stringify(config.data),
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json();
  },
};

// Configure once at app startup
configureApiClient({
  httpClient,
  onUnauthorized: () => router.replace('/login'),
});
```

### 2. Define Your API Endpoints

```typescript
import apiClient, { apiMutation, apiPaginate } from '@krymskyimaksym/react-api-client';

// Types
type User = {
  id: string;
  name: string;
  email: string;
};

type CreateUserRequest = {
  name: string;
  email: string;
};

// GET endpoint
export const userApi = apiClient<User, { id: string }>('/api/users/:id');

// POST endpoint
export const createUserApi = apiMutation<User, CreateUserRequest>(
  '/api/users',
  { method: 'POST' }
);

// Paginated endpoint
export const usersListApi = apiPaginate<
  { data: User[]; total: number },
  User[]
>('/api/users');
```

### 3. Use in Components

#### Query (GET)

```typescript
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error, refetch } = userApi.useFetch(
    { id: userId },
    {
      onSuccess: (data) => console.log('User loaded:', data),
      onError: (error) => console.error('Error:', error),
    }
  );

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <h1>{data?.name}</h1>
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

#### Mutation (POST/PUT/PATCH/DELETE)

```typescript
function CreateUserForm() {
  const { mutate, isLoading, isSuccess, error } = createUserApi.useMutation({
    onSuccess: (data) => {
      console.log('User created:', data);
      // Navigate or update UI
    },
    onError: (error) => {
      console.error('Failed to create user:', error);
    },
  });

  const handleSubmit = (values: CreateUserRequest) => {
    mutate(values);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create User'}
      </button>
      {isSuccess && <p>User created successfully!</p>}
      {error && <p>Error: {error.message}</p>}
    </form>
  );
}
```

#### Pagination

```typescript
function UsersList() {
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = usersListApi.usePaginate();

  return (
    <div>
      {data.map(user => (
        <UserCard key={user.id} user={user} />
      ))}

      {hasNextPage && (
        <button onClick={fetchNextPage} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

## API Reference

### `configureApiClient(config)`

Configure the global API client. Must be called before using any API functions.

```typescript
type ApiClientConfig = {
  httpClient: IHttpClient;
  onUnauthorized?: () => void | Promise<void>;
};
```

### `apiClient<ResponseType, RequestParamsType>(endpoint, config)`

Creates a query client for GET requests.

**Returns:**
- `fetch(params)` - Async function to fetch data
- `useFetch(params, options)` - React hook for data fetching

### `apiMutation<ResponseType, RequestParamsType>(endpoint, config)`

Creates a mutation client for POST/PUT/PATCH/DELETE requests.

**Returns:**
- `mutate(params)` - Async function to execute mutation
- `useMutation(options)` - React hook for mutations

### `apiPaginate<ResponseType, DataArrayType>(endpoint, config, options)`

Creates a paginated query client.

**Returns:**
- `usePaginate(params, options)` - React hook for paginated data

## Advanced Usage

### Dynamic Endpoints

```typescript
const userApi = apiClient<User, { id: string }>(
  (params) => `/api/users/${params.id}`
);
```

### Custom Data Extractors for Pagination

```typescript
const usersApi = apiPaginate<
  { users: User[]; count: number },
  User[]
>(
  '/api/users',
  { method: 'GET' },
  {
    dataExtractor: (response) => response.users,
    totalExtractor: (response) => response.count,
  }
);
```

### Imperative API Calls

```typescript
// Without hooks
const response = await userApi.fetch({ id: '123' });
if (response.status) {
  console.log('Success:', response);
} else {
  console.error('Error:', response.message);
}
```

## HTTP Client Interface

Your HTTP client must implement this interface:

```typescript
interface IHttpClient {
  get<T>(url: string, config?: RequestConfig): Promise<T>;
  request<T>(url: string, config: RequestConfig): Promise<T>;
}
```

### Example with Axios

```typescript
import axios from 'axios';

const httpClient = {
  get: (url, config) => axios.get(url, config).then(res => res.data),
  request: (url, config) => axios(url, config).then(res => res.data),
};
```

### Example with Fetch

```typescript
const httpClient = {
  async get(url, config) {
    const params = new URLSearchParams(config?.params);
    const response = await fetch(`${url}?${params}`);
    if (!response.ok) throw new Error('Request failed');
    return response.json();
  },
  async request(url, config) {
    const response = await fetch(url, {
      method: config.method,
      headers: { 'Content-Type': 'application/json' },
      body: config.data ? JSON.stringify(config.data) : undefined,
    });
    if (!response.ok) throw new Error('Request failed');
    return response.json();
  },
};
```

## Backend integrations

С версии 2.0 пакет полностью backend-agnostic. Контракт «как
разговариваем с бекендом» описывается одним объектом `responseAdapter`
в `configureApiClient`. Без него — встроенный Laravel-fallback
(совместимо с 1.x).

Готовые адаптеры экспортируются из core:
`laravelAdapter`, `jsonApiAdapter`, `graphqlAdapter`, `problemJsonAdapter`,
`plainAdapter`.

Дополнительно — module augmentation `Register['responseShape']`
переключает **типы** так же, как адаптер переключает **runtime**.

### Laravel (default)

```ts
import { configureApiClient, laravelAdapter } from '@krymskyimaksym/react-api-client';

configureApiClient({ httpClient, responseAdapter: laravelAdapter });
// или просто:
configureApiClient({ httpClient });
// useFetch отдаёт ResponseWrapper<T> = { status, message?, errors?, ...T }
// { status: false } → throw ApiError
```

### Plain REST (Express, Fastify, Nest)

```ts
import { configureApiClient, plainAdapter } from '@krymskyimaksym/react-api-client';

// Типы: переключаем DataOf<T> = T (без обёртки)
declare module '@krymskyimaksym/react-api-client' {
  interface Register {
    responseShape: 'plain';
  }
}

configureApiClient({ httpClient, responseAdapter: plainAdapter });
// useFetch<User>() возвращает User напрямую. Ошибки только по HTTP-статусам.
```

### JSON:API

```ts
import { configureApiClient, jsonApiAdapter } from '@krymskyimaksym/react-api-client';

declare module '@krymskyimaksym/react-api-client' {
  interface Register {
    responseShape: 'jsonapi';
  }
}

configureApiClient({ httpClient, responseAdapter: jsonApiAdapter });
// unwrap: r.data → useFetch<User>() возвращает User
// { errors: [...] } → throw ApiError с detail из первого error
```

### GraphQL (любой клиент под капотом)

```ts
import { configureApiClient, graphqlAdapter } from '@krymskyimaksym/react-api-client';

declare module '@krymskyimaksym/react-api-client' {
  interface Register {
    responseShape: 'graphql';
  }
}

configureApiClient({ httpClient, responseAdapter: graphqlAdapter });
// unwrap: r.data → useFetch<Viewer>() возвращает Viewer
// { errors: [...] } → throw ApiError({ errors: GraphQLErrors[] })
```

### RFC 7807 problem+json

```ts
configureApiClient({ httpClient, responseAdapter: problemJsonAdapter });
// 2xx — identity, никакой бизнес-логики поверх HTTP.
// >=400 + Content-Type: application/problem+json → ApiError с title/type.
```

### Свой адаптер

```ts
import type { ResponseAdapter } from '@krymskyimaksym/react-api-client';
import { ApiError } from '@krymskyimaksym/react-api-client';

const myAdapter: ResponseAdapter = {
  unwrap: r => (r as { payload: unknown }).payload,
  isBusinessError: r => (r as { ok?: boolean }).ok === false,
  toError: (r, http) => new ApiError({
    message: (r as { error?: string }).error ?? `HTTP ${http}`,
    status: http,
    raw: r,
  }),
};
```

## Companion packages

| Package | What |
|---|---|
| [`@krymskyimaksym/react-api-client-devtools`](https://www.npmjs.com/package/@krymskyimaksym/react-api-client-devtools) | DevTools UI: `<CacheDebugScreen>` for RN, `<CacheDevtoolsPanel>` for Web |
| [`@krymskyimaksym/eslint-plugin-react-api-client`](https://www.npmjs.com/package/@krymskyimaksym/eslint-plugin-react-api-client) | ESLint rules: `no-await-mutate` (autofix), `no-non-serializable-params`, `require-query-key-when-endpoint-is-fn` |

## React Native

Пакет не зависит от `react-native`, поэтому `focusManager` /
`onlineManager` в RN-приложениях нужно подключать вручную при старте:

```tsx
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@krymskyimaksym/react-api-client';

// При запуске приложения (например, в App.tsx)
AppState.addEventListener('change', state => {
  focusManager.setFocused(state === 'active');
});

// Опционально — NetInfo (если установлен в проекте)
NetInfo.addEventListener(s => onlineManager.setOnline(!!s.isConnected));
```

После этого опции `refetchOnFocus`, `refetchOnAppActive`,
`refetchOnReconnect` в `useFetch` начнут работать.

## `mutateAsync` vs `mutate`

`useMutation` возвращает два варианта вызова — намеренно с разными
типами. **Рекомендуемое имя по умолчанию — `mutateAsync`.**

```tsx
// ✅ Рекомендуемый паттерн: достаём mutateAsync первым.
const { mutateAsync, isLoading } = api.useMutation();

// Для последовательной логики или try/catch — mutateAsync (Promise).
try {
  const result = await mutateAsync({ id: 1 });
} catch (e) {
  // обработка
}

// Для fire-and-forget (кнопка с onClick) — тоже mutateAsync с void:
<Button onPress={() => { void mutateAsync({ id: 1 }); }} />;

// `mutate` остаётся доступным как короткий fire-and-forget без await.
const { mutate } = api.useMutation();
<Button onPress={() => mutate({ id: 1 })} />;
```

❌ **Анти-паттерн:** `await mutate(...)` — `mutate` возвращает `void`,
`await` отдаст `undefined`, `try/catch` не сработает. ESLint-плагин
`@krymskyimaksym/eslint-plugin-react-api-client` ловит это правилом
`no-await-mutate` (с autofix → `mutateAsync`).

Если включён `throwOnError: true` — для критичных мутаций используй
`mutateAsync` и обёртку `try/catch`, иначе ошибка не будет
поймана в caller'е.

## SSR / hydrate

Кэш сериализуется через `cache.dehydrate()` и восстанавливается через
`cache.hydrate(state)`. Стандартный SSR-паттерн:

```ts
// На сервере
const client = new QueryClient();
await client.fetchQuery(['orders'], () => fetchOrders());
const dehydratedState = client.cache.dehydrate();

// Встраиваем в HTML
res.send(`
  <html>
    <body>
      <div id="root">${renderToString(<App />)}</div>
      <script>
        window.__APP_DATA__ = ${JSON.stringify(dehydratedState)};
      </script>
    </body>
  </html>
`);

// На клиенте
const client = new QueryClient();
client.cache.hydrate(window.__APP_DATA__);
ReactDOM.hydrateRoot(
  document.getElementById('root'),
  <ApiClientProvider client={client}>
    <App />
  </ApiClientProvider>,
);
```

Гидратированные данные сразу помечаются как `isStale: true` → подписанные
`useFetch` отдают серверные данные мгновенно и в фоне делают refetch для
проверки актуальности.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions, please use [GitHub Issues](https://github.com/krymskyimaksym/react-api-client/issues).