import { useEffect, useState } from 'react';

import {
  inspectCache,
  summarizeCache,
  useQueryClient,
  type CacheEntrySnapshot,
} from '@krymskyimaksym/react-api-client';

/**
 * Подписка на любые изменения кэша; возвращает свежий снимок entries +
 * сводку. Используется внутренней DevTools-таблицей; пользователи тоже
 * могут собрать свой UI поверх этого хука.
 */
export type CacheView = {
  entries: CacheEntrySnapshot[];
  summary: ReturnType<typeof summarizeCache>;
};

export function useCacheSnapshot(): CacheView {
  const client = useQueryClient();
  const [view, setView] = useState<CacheView>(() => ({
    entries: inspectCache(client.cache),
    summary: summarizeCache(client.cache),
  }));

  useEffect(() => {
    const refresh = () =>
      setView({
        entries: inspectCache(client.cache),
        summary: summarizeCache(client.cache),
      });
    refresh();
    const unsub = client.cache.subscribeAll(refresh);
    return unsub;
  }, [client]);

  return view;
}
