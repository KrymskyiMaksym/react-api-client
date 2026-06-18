import { describe, expect, it } from 'vitest';

import {
  QueryClient,
  inspectCache,
  invalidateAll,
  summarizeCache,
} from '../query';

describe('devtools', () => {
  it('inspectCache отдаёт срез по каждой записи', async () => {
    const c = new QueryClient();
    await c.fetchQuery(['a'], () => Promise.resolve(1));
    await c.fetchQuery(['b'], () => Promise.resolve(2));

    const snap = inspectCache(c.cache);
    expect(snap).toHaveLength(2);
    expect(snap.every(s => s.hasData && s.status === 'success')).toBe(true);
    expect(snap.every(s => s.subscribers === 0)).toBe(true);
  });

  it('subscribers корректно считается', async () => {
    const c = new QueryClient();
    await c.fetchQuery(['a'], () => Promise.resolve(1));
    const u1 = c.cache.subscribe(['a'], () => {});
    const u2 = c.cache.subscribe(['a'], () => {});

    const snap = inspectCache(c.cache).find(s => s.key[0] === 'a');
    expect(snap?.subscribers).toBe(2);
    u1();
    u2();
  });

  it('invalidateAll помечает все записи stale', async () => {
    const c = new QueryClient();
    await c.fetchQuery(['a'], () => Promise.resolve(1));
    await c.fetchQuery(['b'], () => Promise.resolve(2));

    invalidateAll(c);
    expect(inspectCache(c.cache).every(s => s.isStale)).toBe(true);
  });

  it('summarizeCache даёт сводку', async () => {
    const c = new QueryClient();
    await c.fetchQuery(['a'], () => Promise.resolve(1));
    await c.fetchQuery(['b'], () => Promise.resolve(2));
    c.cache.subscribe(['a'], () => {});

    const s = summarizeCache(c.cache);
    expect(s.total).toBe(2);
    expect(s.byStatus.success).toBe(2);
    expect(s.withSubscribers).toBe(1);
    expect(s.inflight).toBe(0);
    expect(s.stale).toBe(0);
  });
});
