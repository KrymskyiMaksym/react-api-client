# @krymskyimaksym/react-api-client-devtools

DevTools для [`@krymskyimaksym/react-api-client`](../..): инспектор
кэша с действиями `refetch` / `invalidate` / `remove` на каждую запись.

Два готовых компонента:
- **`/native`** — экран для React Native (FlatList + Pressable).
- **`/web`** — floating-overlay для веба (как у TanStack Query Devtools).

И общий хук `useCacheSnapshot()` — на нём можно собрать свой UI.

## Установка

```bash
npm i -D @krymskyimaksym/react-api-client-devtools
```

`react-native` — опциональный peer; в веб-сборке не нужен.

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
