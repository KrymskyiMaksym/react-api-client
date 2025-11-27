# Integration Example for Totax Control Project

Пример интеграции пакета в ваш текущий проект Totax Control.

## 1. Установка пакета

После публикации на NPM:

```bash
yarn add @yourname/react-api-client
```

Или для локального тестирования:

```bash
cd /Users/admin/Projects/react-native/react-api-client
npm link

cd /Users/admin/Projects/react-native/totax-control
npm link @yourname/react-api-client
```

## 2. Настройка HTTP Client

Создайте файл `lib/fetch/http-client-adapter.ts`:

```typescript
import { STORAGE_ACCESS_TOKEN, STORAGE_LOCALE } from '@/constants/storage-keys';
import { getItem } from '@/lib/storage';
import type { IHttpClient } from '@yourname/react-api-client';

type HttpClientConfig = {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
};

type RequestConfig = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, string>;
  data?: Record<string, unknown>;
};

class HttpClient implements IHttpClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;
  private requestInterceptor?: (
    config: RequestConfig,
  ) => Promise<RequestConfig>;

  constructor(config: HttpClientConfig) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout ?? 30000;
    this.defaultHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  setRequestInterceptor(
    interceptor: (config: RequestConfig) => Promise<RequestConfig>,
  ) {
    this.requestInterceptor = interceptor;
  }

  private buildUrl(url: string, params?: Record<string, string>): string {
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

    if (!params || Object.keys(params).length === 0) {
      return fullUrl;
    }

    const searchParams = new URLSearchParams(params);
    return `${fullUrl}?${searchParams.toString()}`;
  }

  async request<T>(url: string, config: RequestConfig = {}): Promise<T> {
    let finalConfig = { ...config };

    if (this.requestInterceptor) {
      finalConfig = await this.requestInterceptor(finalConfig);
    }

    const method = finalConfig.method ?? 'GET';
    const headers = {
      ...this.defaultHeaders,
      ...finalConfig.headers,
    };

    const fullUrl = this.buildUrl(
      url,
      method === 'GET' ? finalConfig.params : undefined,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(fullUrl, {
        method,
        headers,
        body:
          method !== 'GET' && finalConfig.data
            ? JSON.stringify(finalConfig.data)
            : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw {
          response: {
            status: response.status,
            data: error,
          },
        };
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async get<T>(url: string, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(url, { ...config, method: 'GET' });
  }
}

const http = new HttpClient({
  baseURL: process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:3000',
  timeout: 30000,
});

// Request interceptor for auth token and locale
http.setRequestInterceptor(async config => {
  const token = await getItem(STORAGE_ACCESS_TOKEN);
  const locale = await getItem(STORAGE_LOCALE);

  config.headers = {
    ...config.headers,
  };

  if (locale) {
    config.headers['Accept-Language'] = locale;
  }

  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  return config;
});

export default http;
```

## 3. Настройка API Client

Обновите файл `app/_layout.tsx` для конфигурации:

```typescript
import { configureApiClient } from '@yourname/react-api-client';
import { router } from 'expo-router';
import http from '@/lib/fetch/http-client-adapter';

// ... другие импорты

export default function RootLayout() {
  // Настройте API client при старте приложения
  useEffect(() => {
    configureApiClient({
      httpClient: http,
      onUnauthorized: () => {
        router.replace('/login');
      },
    });
  }, []);

  // ... остальной код
}
```

## 4. Обновите API endpoints

Файл `lib/api/auth.api.ts`:

```typescript
import apiClient, { apiMutation } from '@yourname/react-api-client';

// ... типы остаются те же

// API endpoints
const loginApi = apiMutation<LoginResponse, LoginRequest, AuthErrorResponse>(
  '/api/auth/login',
  { method: 'POST' },
);

// Остальной код без изменений
```

Файл `lib/api/orders.api.ts`:

```typescript
import apiClient, { apiMutation, apiPaginate } from '@yourname/react-api-client';

// ... код остается практически без изменений
```

## 5. Удалите старые файлы

После успешной миграции можно удалить:

```bash
# Эти файлы теперь в пакете
rm lib/fetch/api-client.ts
rm lib/fetch/types.ts
rm lib/fetch/utils.ts
rm -rf lib/fetch/hooks/
```

Оставьте только:
- `lib/fetch/http-client-adapter.ts` (адаптер для вашего проекта)

## 6. Обновите импорты

Замените импорты во всех файлах:

**Было:**
```typescript
import apiClient from '@/lib/fetch/api-client';
```

**Стало:**
```typescript
import apiClient from '@yourname/react-api-client';
```

## Преимущества миграции

✅ Переиспользование кода между проектами
✅ Централизованные обновления
✅ Легкое тестирование
✅ Меньше кода в основном проекте
✅ Возможность использовать в других проектах