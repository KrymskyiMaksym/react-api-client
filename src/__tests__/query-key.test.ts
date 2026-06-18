import { describe, expect, it } from 'vitest';

import { hashQueryKey, matchQueryKey } from '../query/key';

describe('hashQueryKey', () => {
  it('одинаковые объекты с разным порядком ключей → одинаковый hash', () => {
    expect(hashQueryKey(['orders', { sort: 'date', dir: 'asc' }])).toBe(
      hashQueryKey(['orders', { dir: 'asc', sort: 'date' }]),
    );
  });

  it('разный порядок в массиве → разный hash', () => {
    expect(hashQueryKey(['a', 'b'])).not.toBe(hashQueryKey(['b', 'a']));
  });

  it('undefined-поле в объекте игнорируется', () => {
    expect(hashQueryKey([{ a: 1, b: undefined }])).toBe(hashQueryKey([{ a: 1 }]));
  });

  it('кидает на функции в ключе', () => {
    expect(() => hashQueryKey(['x', () => 1])).toThrow(/функции запрещены/);
  });

  it('кидает на symbol в ключе', () => {
    expect(() => hashQueryKey(['x', Symbol('y')])).toThrow(/symbol/);
  });
});

describe('matchQueryKey', () => {
  it('префикс матчит более длинный ключ', () => {
    expect(matchQueryKey(['orders'], ['orders', 'manager'])).toBe(true);
    expect(matchQueryKey(['orders'], ['orders', 960])).toBe(true);
  });

  it('префикс длиннее ключа → false', () => {
    expect(matchQueryKey(['orders', 'manager'], ['orders'])).toBe(false);
  });

  it('разные элементы в префиксе → false', () => {
    expect(matchQueryKey(['orders'], ['users', 1])).toBe(false);
  });

  it('сравнение объектов независимо от порядка ключей', () => {
    expect(
      matchQueryKey(
        [{ sort: 'date', dir: 'asc' }],
        [{ dir: 'asc', sort: 'date' }, 'extra'],
      ),
    ).toBe(true);
  });
});