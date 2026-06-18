import { describe, expect, it, vi } from 'vitest';

import { QueryClient, persistQueryClient } from '../query';
import type { PersistStorage } from '../query';

function makeMemStorage(): PersistStorage & { _data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    _data: data,
    async getItem(k) {
      return data.get(k) ?? null;
    },
    async setItem(k, v) {
      data.set(k, v);
    },
    async removeItem(k) {
      data.delete(k);
    },
  };
}

describe('persistQueryClient', () => {
  it('dehydrate/hydrate сохраняет и восстанавливает success-данные', async () => {
    const c1 = new QueryClient();
    await c1.fetchQuery(['orders', 1], () => Promise.resolve({ id: 1 }));
    await c1.fetchQuery(['orders', 2], () => Promise.resolve({ id: 2 }));

    const storage = makeMemStorage();
    const { persist, unsubscribe } = persistQueryClient({
      client: c1,
      storage,
      throttleMs: 999999, // отключим автотик
    });
    await persist();
    unsubscribe();

    const c2 = new QueryClient();
    const { restore } = persistQueryClient({
      client: c2,
      storage,
      throttleMs: 999999,
    });
    await restore();

    expect(c2.getQueryData(['orders', 1])).toEqual({ id: 1 });
    expect(c2.getQueryData(['orders', 2])).toEqual({ id: 2 });
    // гидратированные данные сразу stale
    expect(c2.cache.getState(['orders', 1])?.isStale).toBe(true);
  });

  it('версия не совпала → снэпшот выбрасывается', async () => {
    const c1 = new QueryClient();
    await c1.fetchQuery(['k'], () => Promise.resolve('v1'));

    const storage = makeMemStorage();
    const a = persistQueryClient({
      client: c1,
      storage,
      throttleMs: 999999,
      version: 1,
    });
    await a.persist();
    a.unsubscribe();

    const c2 = new QueryClient();
    const b = persistQueryClient({
      client: c2,
      storage,
      throttleMs: 999999,
      version: 2,
    });
    await b.restore();

    expect(c2.getQueryData(['k'])).toBeUndefined();
    expect(await storage.getItem('react-api-client:cache')).toBeNull();
  });

  it('allowList фильтрует, что сохранять', async () => {
    const c = new QueryClient();
    await c.fetchQuery(['public', 1], () => Promise.resolve('a'));
    await c.fetchQuery(['secret', 1], () => Promise.resolve('b'));

    const storage = makeMemStorage();
    const { persist, unsubscribe } = persistQueryClient({
      client: c,
      storage,
      throttleMs: 999999,
      allowList: key => key[0] === 'public',
    });
    await persist();
    unsubscribe();

    const c2 = new QueryClient();
    const r = persistQueryClient({
      client: c2,
      storage,
      throttleMs: 999999,
    });
    await r.restore();

    expect(c2.getQueryData(['public', 1])).toBe('a');
    expect(c2.getQueryData(['secret', 1])).toBeUndefined();
  });

  it('повторный persist без изменений не пишет в storage', async () => {
    const c = new QueryClient();
    await c.fetchQuery(['k'], () => Promise.resolve('v'));
    const storage = makeMemStorage();
    const setItem = vi.spyOn(storage, 'setItem');

    const p = persistQueryClient({ client: c, storage, throttleMs: 999999 });
    await p.persist();
    await p.persist();
    p.unsubscribe();

    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
