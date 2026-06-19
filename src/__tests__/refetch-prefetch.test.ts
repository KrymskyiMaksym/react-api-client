import { describe, expect, it, vi } from 'vitest';

import { QueryClient } from '../query';

describe('refetchQueries', () => {
  it('перезапускает все матчинг записи через сохранённый lastQueryFn', async () => {
    const c = new QueryClient();
    let n = 0;
    const fn1 = vi.fn(async () => ++n);
    const fn2 = vi.fn(async () => ++n);

    await c.fetchQuery(['orders', 1], fn1);
    await c.fetchQuery(['orders', 2], fn2);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);

    await c.refetchQueries(['orders']);
    expect(fn1).toHaveBeenCalledTimes(2);
    expect(fn2).toHaveBeenCalledTimes(2);
  });

  it('не падает на пустом матче', async () => {
    const c = new QueryClient();
    await c.refetchQueries(['nothing']);
  });

  it('проглатывает ошибки отдельных запросов', async () => {
    const c = new QueryClient();
    await c.fetchQuery(['ok'], async () => 1);
    await c.fetchQuery(['bad'], async () => 'fine first');
    // подменяем lastQueryFn у bad на падающий через повторный fetch
    await c.fetchQuery(['bad'], async () => {
      throw new Error('boom');
    }).catch(() => undefined);

    await expect(c.refetchQueries(() => true)).resolves.toBeUndefined();
  });
});

describe('prefetchQuery', () => {
  it('кладёт в кэш и не бросает при ошибке', async () => {
    const c = new QueryClient();
    await c.prefetchQuery(['x'], async () => 'v');
    expect(c.getQueryData(['x'])).toBe('v');

    await expect(
      c.prefetchQuery(['y'], async () => {
        throw new Error('nope');
      }),
    ).resolves.toBeUndefined();
  });
});
