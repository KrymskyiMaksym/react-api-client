import { useCallback, useEffect, useState } from 'react';

import { getQueryClient } from '../query/client';
import type { QueryKey } from '../query/key';

/**
 * Пакетное чтение нескольких ключей из кэша. Хук подписан на каждый
 * ключ и перерендерится, когда любое из значений изменится.
 *
 * Возвращает массив значений того же порядка, что и `keys`. Если ключа
 * нет в кэше — соответствующий элемент `undefined`.
 *
 * Не делает запросов — только читает. Если данных нужно «загрузить» —
 * используй `useFetch`/`useQuery` отдельно.
 *
 * @example
 * const [orders, chats, tasks] = useQueriesData<
 *   [Board, ChatsUnread, TasksNew]
 * >([
 *   ['orders', 'board'],
 *   ['chats', 'unread'],
 *   ['tasks', 'new'],
 * ]);
 */
export function useQueriesData<T extends readonly unknown[]>(
  keys: readonly QueryKey[],
): { [K in keyof T]: T[K] | undefined } {
  const client = getQueryClient();
  const get = useCallback(
    () => keys.map(k => client.getQueryData(k)) as unknown as {
      [K in keyof T]: T[K] | undefined;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, keys.map(k => JSON.stringify(k)).join('|')],
  );

  const [snapshot, setSnapshot] = useState(get);

  useEffect(() => {
    setSnapshot(get());
    const unsubs = keys.map(k =>
      client.cache.subscribe(k, () => setSnapshot(get())),
    );
    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, get]);

  return snapshot;
}
