export type QueryKey = readonly unknown[];

/**
 * Стабильная сериализация ключа кэша.
 * - Объекты сериализуются с сортировкой ключей.
 * - Массивы сохраняют порядок.
 * - Функции и symbol — недопустимы (как в TanStack Query), кидаем.
 * - undefined в массиве становится null, в объекте — поле пропускается.
 *
 * Пример: ['orders', { sort: 'date', dir: 'asc' }] и
 * ['orders', { dir: 'asc', sort: 'date' }] дают одинаковый hash.
 */
export function hashQueryKey(key: QueryKey): string {
  return JSON.stringify(key, (_, value) => {
    if (typeof value === 'function') {
      throw new Error(
        'react-api-client: функции запрещены в queryKey — ключ должен быть сериализуем',
      );
    }
    if (typeof value === 'symbol') {
      throw new Error(
        'react-api-client: symbol запрещены в queryKey — ключ должен быть сериализуем',
      );
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sortedKeys = Object.keys(value).sort();
      const result: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        const v = (value as Record<string, unknown>)[k];
        if (v !== undefined) result[k] = v;
      }
      return result;
    }
    return value;
  });
}

/**
 * Проверяет, начинается ли `key` с `prefix`.
 * Используется для invalidateQueries по префиксу: ['orders'] матчит
 * и ['orders', 'manager'], и ['orders', 960].
 */
export function matchQueryKey(prefix: QueryKey, key: QueryKey): boolean {
  if (prefix.length > key.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (hashQueryKey([prefix[i]]) !== hashQueryKey([key[i]])) return false;
  }
  return true;
}