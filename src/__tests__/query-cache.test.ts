import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryCache } from '../query/cache';

describe('QueryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetch выполняет запрос и кладёт данные в кэш', async () => {
    const cache = new QueryCache();
    const queryFn = vi.fn().mockResolvedValue({ id: 1 });

    const data = await cache.fetch(['orders', 1], queryFn);
    expect(data).toEqual({ id: 1 });
    expect(cache.getData(['orders', 1])).toEqual({ id: 1 });
  });

  it('два одновременных fetch одного ключа → один реальный запрос (dedupe)', async () => {
    const cache = new QueryCache();
    let resolveFn: (v: unknown) => void = () => {};
    const queryFn = vi
      .fn()
      .mockImplementation(() => new Promise(resolve => (resolveFn = resolve)));

    const p1 = cache.fetch(['x'], queryFn);
    const p2 = cache.fetch(['x'], queryFn);
    resolveFn({ ok: true });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
  });

  it('staleTime: свежие данные возвращаются без повторного запроса', async () => {
    const cache = new QueryCache();
    const queryFn = vi.fn().mockResolvedValue(1);

    await cache.fetch(['k'], queryFn, { staleTime: 10_000 });
    await cache.fetch(['k'], queryFn, { staleTime: 10_000 });
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('после staleTime — повторный запрос идёт', async () => {
    const cache = new QueryCache();
    const queryFn = vi.fn().mockResolvedValue(1);

    await cache.fetch(['k'], queryFn, { staleTime: 1000 });
    vi.setSystemTime(Date.now() + 5000);
    await cache.fetch(['k'], queryFn, { staleTime: 1000 });
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('subscribe: подписчик получает уведомление на каждое изменение', async () => {
    const cache = new QueryCache();
    const listener = vi.fn();
    cache.subscribe(['k'], listener);

    await cache.fetch(['k'], () => Promise.resolve(1));
    // loading + success
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('invalidate помечает запись как stale и уведомляет подписчиков', async () => {
    const cache = new QueryCache();
    await cache.fetch(['orders', 1], () => Promise.resolve({ id: 1 }), {
      staleTime: 10_000,
    });
    const listener = vi.fn();
    cache.subscribe(['orders', 1], listener);

    cache.invalidate(['orders']);
    expect(listener).toHaveBeenCalled();
    expect(cache.getState(['orders', 1])?.isStale).toBe(true);
  });

  it('setData точечно обновляет данные и уведомляет подписчиков', () => {
    const cache = new QueryCache();
    const listener = vi.fn();
    cache.subscribe(['k'], listener);
    cache.setData(['k'], { v: 42 });

    expect(cache.getData(['k'])).toEqual({ v: 42 });
    expect(listener).toHaveBeenCalled();
  });

  it('GC: запись удаляется через gcTime после ухода последнего подписчика', async () => {
    const cache = new QueryCache();
    await cache.fetch(['k'], () => Promise.resolve(1), { gcTime: 1000 });
    const unsubscribe = cache.subscribe(['k'], () => {});
    unsubscribe();

    expect(cache.getData(['k'])).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(cache.getData(['k'])).toBeUndefined();
  });

  it('новый подписчик отменяет запланированный GC', async () => {
    const cache = new QueryCache();
    await cache.fetch(['k'], () => Promise.resolve(1), { gcTime: 1000 });

    const u1 = cache.subscribe(['k'], () => {});
    u1();
    vi.advanceTimersByTime(500);
    cache.subscribe(['k'], () => {}); // снова подписались до истечения gcTime
    vi.advanceTimersByTime(1000);

    expect(cache.getData(['k'])).toBe(1);
  });

  it('ошибка в queryFn попадает в state.error и пробрасывается', async () => {
    const cache = new QueryCache();
    await expect(
      cache.fetch(['k'], () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(cache.getState(['k'])?.status).toBe('error');
    expect(cache.getState(['k'])?.error?.message).toBe('boom');
  });

  it('remove удаляет запись', async () => {
    const cache = new QueryCache();
    await cache.fetch(['k'], () => Promise.resolve(1));
    cache.remove(['k']);
    expect(cache.getData(['k'])).toBeUndefined();
  });
});