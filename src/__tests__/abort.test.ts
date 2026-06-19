import { describe, expect, it, vi } from 'vitest';

import { QueryCache } from '../query/cache';

describe('AbortSignal в QueryCache', () => {
  it('queryFn получает signal в ctx', async () => {
    const cache = new QueryCache();
    const queryFn = vi.fn(async (ctx: { signal: AbortSignal }) => {
      expect(ctx.signal).toBeInstanceOf(AbortSignal);
      expect(ctx.signal.aborted).toBe(false);
      return 'ok';
    });
    await cache.fetch(['k'], queryFn);
    expect(queryFn).toHaveBeenCalledOnce();
  });

  it('cancelQueries реально вызывает controller.abort()', async () => {
    const cache = new QueryCache();
    let captured: AbortSignal | null = null;
    let resolveFn: (v: string) => void = () => {};
    const queryFn = (ctx: { signal: AbortSignal }) => {
      captured = ctx.signal;
      return new Promise<string>(r => (resolveFn = r));
    };

    const promise = cache.fetch(['k'], queryFn);
    cache.cancelQueries(['k']);

    expect(captured?.aborted).toBe(true);
    // resolve чтоб не висеть, но результат не должен попасть в кэш (по токену)
    resolveFn('late');
    await promise;
    expect(cache.getData(['k'])).toBeUndefined();
  });

  it('новый fetch после cancel создаёт новый controller', async () => {
    const cache = new QueryCache();
    const signals: AbortSignal[] = [];
    let resolve1: (v: string) => void = () => {};
    let resolve2: (v: string) => void = () => {};

    const queryFn = vi
      .fn()
      .mockImplementationOnce((ctx: { signal: AbortSignal }) => {
        signals.push(ctx.signal);
        return new Promise<string>(r => (resolve1 = r));
      })
      .mockImplementationOnce((ctx: { signal: AbortSignal }) => {
        signals.push(ctx.signal);
        return new Promise<string>(r => (resolve2 = r));
      });

    const p1 = cache.fetch(['k'], queryFn);
    cache.cancelQueries(['k']);
    resolve1('cancelled');
    await p1;

    const p2 = cache.fetch(['k'], queryFn);
    resolve2('fresh');
    expect(await p2).toBe('fresh');
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });
});