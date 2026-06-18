import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import { QueryClient, setQueryClient } from './client';

const QueryClientContext = createContext<QueryClient | null>(null);

export type ApiClientProviderProps = {
  client?: QueryClient;
  children: ReactNode;
};

/**
 * Корневой Provider пакета. Создаёт (или принимает) QueryClient и кладёт
 * его в React Context. Хуки достают клиент через useQueryClient().
 *
 * Также синхронизирует переданный client с singleton'ом
 * getQueryClient() — чтобы push-handler'ы вне React-дерева могли дергать
 * `getQueryClient().invalidateQueries(...)`.
 */
export function ApiClientProvider({
  client,
  children,
}: ApiClientProviderProps) {
  const value = useMemo(() => {
    const instance = client ?? new QueryClient();
    setQueryClient(instance);
    return instance;
  }, [client]);

  return createElement(
    QueryClientContext.Provider,
    { value },
    children,
  );
}

export function useQueryClient(): QueryClient {
  const ctx = useContext(QueryClientContext);
  if (!ctx) {
    throw new Error(
      'useQueryClient: не найден ApiClientProvider. Оберни корень приложения в <ApiClientProvider>.',
    );
  }
  return ctx;
}
