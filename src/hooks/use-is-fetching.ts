import { useCallback, useEffect, useState } from 'react';

import { getQueryClient } from '../query/client';
import type { QueryKey } from '../query/key';
import { mutationCounter } from '../query/mutation-counter';

/**
 * Возвращает число активных (inflight) запросов в кэше.
 * Полезно для глобального индикатора загрузки в шапке.
 *
 * С опциональным predicate — считает только матчинг запросы:
 * `useIsFetching(['orders'])` — сколько inflight'ов под префиксом ['orders'].
 */
export function useIsFetching(
  predicate?: QueryKey | ((key: QueryKey) => boolean),
): number {
  const client = getQueryClient();
  const get = useCallback(
    () => client.cache.countFetching(predicate),
    [client.cache, predicate],
  );
  const [count, setCount] = useState<number>(get);

  useEffect(() => {
    setCount(get());
    const unsub = client.cache.subscribeAll(() => setCount(get()));
    return unsub;
  }, [client.cache, get]);

  return count;
}

/**
 * Возвращает число активных мутаций. С predicate — только матчинг.
 * Скоуп мутации = первый ключ из её `invalidateKeys`, если задан массив;
 * иначе — без скоупа (попадает только в безусловный счётчик).
 */
export function useIsMutating(
  predicate?: QueryKey | ((scope: QueryKey | undefined) => boolean),
): number {
  const get = useCallback(
    () => mutationCounter.count(predicate),
    [predicate],
  );
  const [count, setCount] = useState<number>(get);

  useEffect(() => {
    setCount(get());
    const unsub = mutationCounter.subscribe(() => setCount(get()));
    return unsub;
  }, [get]);

  return count;
}
