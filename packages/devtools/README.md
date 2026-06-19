# @krymskyimaksym/react-api-client-devtools

DevTools для [`@krymskyimaksym/react-api-client`](https://www.npmjs.com/package/@krymskyimaksym/react-api-client) (требуется `^2.0.0`): инспектор
кэша с действиями `refetch` / `invalidate` / `remove` на каждую запись.

Два готовых компонента:
- **`/native`** — экран для React Native (FlatList + Pressable).
- **`/web`** — floating-overlay для веба (как у TanStack Query Devtools).

И общий хук `useCacheSnapshot()` — на нём можно собрать свой UI.

## Установка

```bash
# npm
npm install -D @krymskyimaksym/react-api-client-devtools

# yarn
yarn add -D @krymskyimaksym/react-api-client-devtools

# pnpm
pnpm add -D @krymskyimaksym/react-api-client-devtools

# bun
bun add -d @krymskyimaksym/react-api-client-devtools
```

**Peer-зависимости:** `@krymskyimaksym/react-api-client ^2.1.0`,
`react >= 16.8`. `react-native` подхватывается опционально через
`try { require('react-native') } catch` — отдельно ставить не нужно
(он у тебя уже стоит, если ты в RN-проекте).

## React Native

```tsx
import { CacheDebugScreen } from '@krymskyimaksym/react-api-client-devtools/native';

if (__DEV__) {
  // В навигаторе:
  <Stack.Screen name="cache" component={CacheDebugScreen} />
}
```

## Web

```tsx
import { CacheDevtoolsPanel } from '@krymskyimaksym/react-api-client-devtools/web';

function App() {
  return (
    <ApiClientProvider client={queryClient}>
      <Routes />
      {process.env.NODE_ENV === 'development' && <CacheDevtoolsPanel />}
    </ApiClientProvider>
  );
}
```

## Кастомный UI

```tsx
import { useCacheSnapshot } from '@krymskyimaksym/react-api-client-devtools';

function MyDebug() {
  const { entries, summary } = useCacheSnapshot();
  return <pre>{JSON.stringify(summary, null, 2)}</pre>;
}
```

## License

MIT
