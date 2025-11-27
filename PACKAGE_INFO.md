# @krymskyimaksym/react-api-client - Package Info

## 📦 Package Structure

```
react-api-client/
├── src/
│   ├── index.ts              # Main exports
│   ├── config.ts             # Global configuration
│   ├── utils.ts              # Utility functions
│   ├── types/
│   │   └── index.ts          # TypeScript types
│   └── hooks/
│       ├── index.ts          # Hooks exports
│       ├── use-fetch.ts      # Query hook (GET)
│       ├── use-mutation.ts   # Mutation hook (POST/PUT/PATCH/DELETE)
│       └── use-paginate.ts   # Pagination hook
├── .github/workflows/
│   ├── ci.yml               # CI pipeline
│   └── publish.yml          # Auto-publish on release
├── package.json
├── tsconfig.json
├── tsup.config.ts           # Build configuration
├── README.md                # User documentation
├── PUBLISHING.md            # Publishing guide
├── INTEGRATION_EXAMPLE.md  # Integration example for Totax
└── NEXT_STEPS.md           # Step-by-step guide

```

## 🎯 Key Features

### 1. Type-Safe
- Full TypeScript support
- Generic types for requests/responses
- Intellisense автодополнение

### 2. React Hooks
- `useFetch` - для GET запросов
- `useMutation` - для POST/PUT/PATCH/DELETE
- `usePaginate` - для пагинации

### 3. Flexible
- Инъекция своего HTTP client
- Кастомные обработчики ошибок
- Работает с fetch, axios, или любым другим

### 4. Zero Dependencies
- Только React как peer dependency
- Нет лишних зависимостей
- Минимальный bundle size

### 5. Modern Build
- ESM и CJS форматы
- TypeScript declarations
- Source maps
- Tree-shaking support

## 📊 Package Stats

**Size:** ~15KB (minified)
**Files:**
- `dist/index.js` (CJS)
- `dist/index.mjs` (ESM)
- `dist/index.d.ts` (Types)
- Source maps

**Exports:**
```typescript
// Main functions
export default apiClient
export { apiMutation, apiPaginate }

// Configuration
export { configureApiClient, getConfig, isConfigured }

// Types
export type {
  ResponseWrapper,
  UseFetchOptions,
  UseFetchResult,
  UseMutationOptions,
  UseMutationResult,
  UsePaginateOptions,
  UsePaginateResult,
  ApiClientConfig,
  IHttpClient,
}
```

## 🔄 Workflow

### Development
```bash
npm install     # Install dependencies
npm run dev     # Watch mode for development
npm run lint    # Lint code
npm run typecheck  # Type checking
```

### Build
```bash
npm run build   # Build for production
```

### Testing
```bash
npm test        # Run tests (vitest)
npm run test:coverage  # Coverage report
```

### Publishing
```bash
npm version patch/minor/major
git push && git push --tags
npm publish --access public
```

## 🚀 Usage Example

```typescript
// 1. Configure once at app startup
import { configureApiClient } from '@krymskyimaksym/react-api-client';

configureApiClient({
  httpClient: myHttpClient,
  onUnauthorized: () => router.replace('/login'),
});

// 2. Define API
import apiClient from '@krymskyimaksym/react-api-client';

const userApi = apiClient<User, { id: string }>('/api/users/:id');

// 3. Use in components
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = userApi.useFetch({ id: userId });

  if (isLoading) return <Loading />;
  if (error) return <Error error={error} />;

  return <div>{data?.name}</div>;
}
```

## 📈 Roadmap

Возможные улучшения в будущих версиях:

- [ ] Query caching
- [ ] Optimistic updates
- [ ] Request deduplication
- [ ] Offline support
- [ ] React Query integration
- [ ] Middleware support
- [ ] Request/response interceptors
- [ ] Retry logic
- [ ] AbortController support

## 🤝 Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📝 License

MIT - see LICENSE file

## 🔗 Links

- NPM: https://www.npmjs.com/package/@krymskyimaksym/react-api-client
- GitHub: https://github.com/krymskyimaksym/react-api-client
- Issues: https://github.com/krymskyimaksym/react-api-client/issues