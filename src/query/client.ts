import { QueryCache, type FetchOptions, type QueryFn } from './cache';
import type { QueryKey } from './key';

/**
 * Высокоуровневый фасад над QueryCache: единый объект, который удобно
 * прокидывать через Provider и дергать из push-handler'ов / эффектов.
 *
 * Сами queryFn-ы здесь не регистрируются — refetchQueries требует, чтобы
 * либо подписчик сам перезапустил запрос (через subscribe), либо чтобы
 * вызвали fetchQuery с queryFn вручную. Это намеренно: хук React сам
 * знает, как собрать свой queryFn из endpoint/params.
 */
export class QueryClient {
  readonly cache: QueryCache;

  constructor(cache?: QueryCache) {
    this.cache = cache ?? new QueryCache();
  }

  getQueryData<T>(key: QueryKey): T | undefined {
    return this.cache.getData<T>(key);
  }

  setQueryData<T>(
    key: QueryKey,
    updater: T | ((prev: T | undefined) => T),
  ): void {
    this.cache.setData(key, updater);
  }

  fetchQuery<T>(
    key: QueryKey,
    queryFn: QueryFn<T>,
    options?: FetchOptions,
  ): Promise<T> {
    return this.cache.fetch(key, queryFn, options);
  }

  invalidateQueries(
    predicate: QueryKey | ((key: QueryKey) => boolean),
  ): void {
    this.cache.invalidate(predicate);
  }

  removeQueries(predicate: QueryKey | ((key: QueryKey) => boolean)): void {
    this.cache.remove(predicate);
  }

  cancelQueries(predicate: QueryKey | ((key: QueryKey) => boolean)): void {
    this.cache.cancelQueries(predicate);
  }
}

let globalClient: QueryClient | null = null;

/** Singleton-доступ для тех мест, где Provider недоступен (push-handler и т.п.). */
export function getQueryClient(): QueryClient {
  if (!globalClient) globalClient = new QueryClient();
  return globalClient;
}

export function setQueryClient(client: QueryClient): void {
  globalClient = client;
}