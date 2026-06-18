import type { DehydratedState } from './cache';
import type { QueryClient } from './client';
import type { QueryKey } from './key';

/**
 * Storage-адаптер. Совместим с AsyncStorage и expo-secure-store:
 *   { getItem(key): Promise<string|null>, setItem(key, value): Promise<void>,
 *     removeItem(key): Promise<void> }.
 */
export interface PersistStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type PersistOptions = {
  client: QueryClient;
  storage: PersistStorage;
  /** Ключ в storage. По умолчанию 'react-api-client:cache'. */
  storageKey?: string;
  /** Дросселирование записи (ms). По умолчанию 1000. */
  throttleMs?: number;
  /** Фильтр ключей: что вообще сохранять. По умолчанию — всё. */
  allowList?: (key: QueryKey) => boolean;
  /** Максимальный возраст сохранённого снэпшота (ms). Старее — выбрасываем. */
  maxAge?: number;
  /**
   * Версия снэпшота. При несовпадении — снэпшот игнорируется и удаляется.
   * Поднимай при изменении формата данных в кэше.
   */
  version?: string | number;
};

type Snapshot = {
  version?: string | number;
  savedAt: number;
  state: DehydratedState;
};

/**
 * Подключает QueryClient к persistent storage.
 * Возвращает { restore, persist, unsubscribe }:
 * - `restore()` — гидратирует кэш из storage (вызывать на старте приложения).
 * - `persist()` — форс-запись текущего состояния.
 * - `unsubscribe()` — отключить авто-сохранение.
 *
 * Простая модель: на каждое изменение через client.cache._debugEntries
 * нет подписки, поэтому persist вызываем вручную из мутаций / по таймеру.
 * Здесь — таймер по throttleMs. Этого хватает для чатов/архива.
 */
export function persistQueryClient(options: PersistOptions): {
  restore: () => Promise<void>;
  persist: () => Promise<void>;
  unsubscribe: () => void;
} {
  const {
    client,
    storage,
    storageKey = 'react-api-client:cache',
    throttleMs = 1000,
    allowList,
    maxAge,
    version,
  } = options;

  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSerialized: string | null = null;

  const persist = async () => {
    const state = client.cache.dehydrate(allowList);
    if (state.queries.length === 0) {
      // нечего сохранять — но не очищаем (могло быть восстановлено ранее)
      return;
    }
    const snap: Snapshot = { version, savedAt: Date.now(), state };
    const serialized = JSON.stringify(snap);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    await storage.setItem(storageKey, serialized);
  };

  const restore = async () => {
    const raw = await storage.getItem(storageKey);
    if (!raw) return;
    try {
      const snap = JSON.parse(raw) as Snapshot;
      if (version !== undefined && snap.version !== version) {
        await storage.removeItem(storageKey);
        return;
      }
      if (maxAge && Date.now() - snap.savedAt > maxAge) {
        await storage.removeItem(storageKey);
        return;
      }
      client.cache.hydrate(snap.state);
    } catch {
      await storage.removeItem(storageKey);
    }
  };

  timer = setInterval(() => {
    void persist();
  }, throttleMs);

  return {
    restore,
    persist,
    unsubscribe: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
