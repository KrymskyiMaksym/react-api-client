import type { QueryCache, QueryStatus } from './cache';
import type { QueryClient } from './client';
import type { QueryKey } from './key';

export type CacheEntrySnapshot = {
  key: QueryKey;
  hash: string;
  status: QueryStatus;
  isStale: boolean;
  updatedAt: number;
  hasData: boolean;
  subscribers: number;
  hasInflight: boolean;
  errorMessage: string | null;
};

/**
 * Снимок состояния всего кэша — без приватных полей и без данных.
 * Удобно выводить в debug-экране или логировать.
 */
export function inspectCache(cache: QueryCache): CacheEntrySnapshot[] {
  const entries = cache._debugEntries();
  const snapshot: CacheEntrySnapshot[] = [];
  for (const [hash, entry] of entries) {
    snapshot.push({
      key: entry.key,
      hash,
      status: entry.state.status,
      isStale: entry.state.isStale,
      updatedAt: entry.state.updatedAt,
      hasData: entry.state.data !== undefined,
      subscribers: entry.subscribers.size,
      hasInflight: entry.inflight !== null,
      errorMessage: entry.state.error?.message ?? null,
    });
  }
  return snapshot;
}

/** «invalidate all» — пометить весь кэш как stale. */
export function invalidateAll(client: QueryClient): void {
  client.invalidateQueries(() => true);
}

/** Краткая сводка для логов: сколько записей, активных подписчиков, inflight. */
export function summarizeCache(cache: QueryCache): {
  total: number;
  withSubscribers: number;
  inflight: number;
  stale: number;
  byStatus: Record<QueryStatus, number>;
} {
  const byStatus: Record<QueryStatus, number> = {
    idle: 0,
    loading: 0,
    success: 0,
    error: 0,
  };
  let withSubscribers = 0;
  let inflight = 0;
  let stale = 0;
  const entries = cache._debugEntries();
  for (const entry of entries.values()) {
    byStatus[entry.state.status]++;
    if (entry.subscribers.size > 0) withSubscribers++;
    if (entry.inflight) inflight++;
    if (entry.state.isStale) stale++;
  }
  return { total: entries.size, withSubscribers, inflight, stale, byStatus };
}
