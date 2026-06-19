import { hashQueryKey, matchQueryKey, type QueryKey } from './key';

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

export type QueryState<T> = {
  data: T | undefined;
  error: Error | null;
  status: QueryStatus;
  updatedAt: number;
  isStale: boolean;
};

type Listener = () => void;

type QueryEntry<T> = {
  key: QueryKey;
  state: QueryState<T>;
  subscribers: Set<Listener>;
  inflight: Promise<T> | null;
  inflightController: AbortController | null;
  gcTimer: ReturnType<typeof setTimeout> | null;
  staleTime: number;
  gcTime: number;
  /**
   * Последний queryFn, переданный в fetch для этого ключа.
   * Используется refetchQueries: позволяет перезапустить запрос,
   * не зная queryFn из caller'а (например, push-handler).
   */
  lastQueryFn: QueryFn<T> | null;
};

export type QueryFnContext = { signal: AbortSignal };
/**
 * queryFn принимает контекст с AbortSignal. Если HTTP-клиент его
 * использует — отмена будет реальной; если игнорирует — поведение
 * деградирует до текущего (запрос идёт до конца, но кэш игнорирует результат).
 *
 * Для обратной совместимости старая сигнатура `() => Promise<T>` тоже
 * принимается — пакет просто не передаст signal внутрь.
 */
export type QueryFn<T> = (ctx: QueryFnContext) => Promise<T>;

export type FetchOptions = {
  staleTime?: number;
  gcTime?: number;
  /** Если true — игнорируем staleTime и форсим запрос */
  force?: boolean;
};

const DEFAULT_GC_TIME = 5 * 60 * 1000;
const DEFAULT_STALE_TIME = 0;

/**
 * In-memory кэш запросов с подпиской по ключу, dedupe inflight-промисов
 * и сборкой мусора через gcTime.
 */
export class QueryCache {
  private entries = new Map<string, QueryEntry<unknown>>();
  private globalListeners = new Set<Listener>();

  /**
   * Подписка на любое изменение кэша: setData, invalidate, remove,
   * успешный/ошибочный fetch. Используется persistQueryClient и
   * devtools-подобными адаптерами. Не дублирует `subscribe(key, ...)`.
   */
  subscribeAll(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  private notifyGlobal() {
    for (const listener of this.globalListeners) listener();
  }

  private ensureEntry<T>(
    key: QueryKey,
    staleTime?: number,
    gcTime?: number,
  ): QueryEntry<T> {
    const hash = hashQueryKey(key);
    let entry = this.entries.get(hash) as QueryEntry<T> | undefined;
    if (!entry) {
      entry = {
        key,
        state: {
          data: undefined,
          error: null,
          status: 'idle',
          updatedAt: 0,
          isStale: true,
        },
        subscribers: new Set(),
        inflight: null,
        inflightController: null,
        gcTimer: null,
        lastQueryFn: null,
        staleTime: staleTime ?? DEFAULT_STALE_TIME,
        gcTime: gcTime ?? DEFAULT_GC_TIME,
      };
      this.entries.set(hash, entry as QueryEntry<unknown>);
    } else {
      // обновим только явно переданные параметры
      if (staleTime !== undefined) entry.staleTime = staleTime;
      if (gcTime !== undefined) entry.gcTime = gcTime;
    }
    return entry;
  }

  getState<T>(key: QueryKey): QueryState<T> | undefined {
    const entry = this.entries.get(hashQueryKey(key)) as
      | QueryEntry<T>
      | undefined;
    return entry?.state;
  }

  getData<T>(key: QueryKey): T | undefined {
    return this.getState<T>(key)?.data;
  }

  setData<T>(key: QueryKey, updater: T | ((prev: T | undefined) => T)): void {
    const entry = this.ensureEntry<T>(key);
    const next =
      typeof updater === 'function'
        ? (updater as (prev: T | undefined) => T)(entry.state.data)
        : updater;
    entry.state = {
      data: next,
      error: null,
      status: 'success',
      updatedAt: Date.now(),
      isStale: false,
    };
    this.notify(entry);
  }

  /**
   * Подписка на изменения ключа. Возвращает unsubscribe.
   * Подписка останавливает GC таймер; отписка — запускает его обратно.
   */
  subscribe(key: QueryKey, listener: Listener): () => void {
    const entry = this.ensureEntry<unknown>(key);
    entry.subscribers.add(listener);
    if (entry.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }
    return () => {
      entry.subscribers.delete(listener);
      if (entry.subscribers.size === 0) this.scheduleGc(entry);
    };
  }

  private notify<T>(entry: QueryEntry<T>) {
    for (const listener of entry.subscribers) listener();
    this.notifyGlobal();
  }

  private scheduleGc<T>(entry: QueryEntry<T>) {
    if (entry.gcTimer) clearTimeout(entry.gcTimer);
    if (entry.gcTime <= 0) {
      this.entries.delete(hashQueryKey(entry.key));
      return;
    }
    entry.gcTimer = setTimeout(() => {
      if (entry.subscribers.size === 0 && !entry.inflight) {
        this.entries.delete(hashQueryKey(entry.key));
      }
    }, entry.gcTime);
  }

  /**
   * Запускает или присоединяется к inflight-запросу.
   * Если данные свежие (не stale) и не force — отдаёт кэш без запроса.
   */
  async fetch<T>(
    key: QueryKey,
    queryFn: QueryFn<T>,
    options: FetchOptions = {},
  ): Promise<T> {
    const staleTime = options.staleTime ?? DEFAULT_STALE_TIME;
    const gcTime = options.gcTime ?? DEFAULT_GC_TIME;
    const entry = this.ensureEntry<T>(key, staleTime, gcTime);

    const isFresh =
      entry.state.status === 'success' &&
      !entry.state.isStale &&
      Date.now() - entry.state.updatedAt < staleTime;

    // Запоминаем queryFn для refetchQueries (используется push-handler'ами
    // и client.refetchQueries без знания queryFn).
    entry.lastQueryFn = queryFn as QueryFn<unknown> as QueryFn<T>;

    if (!options.force && isFresh && entry.state.data !== undefined) {
      return entry.state.data;
    }

    if (entry.inflight) return entry.inflight;

    entry.state = { ...entry.state, status: 'loading', error: null };
    this.notify(entry);

    const controller = new AbortController();
    const token = Symbol('inflight');
    (entry as QueryEntry<T> & { inflightToken?: symbol }).inflightToken = token;
    entry.inflightController = controller;

    const isCurrent = () =>
      (entry as QueryEntry<T> & { inflightToken?: symbol }).inflightToken ===
      token;

    const myPromise: Promise<T> = (async () => {
      try {
        const data = await queryFn({ signal: controller.signal });
        if (!isCurrent()) return data;
        entry.state = {
          data,
          error: null,
          status: 'success',
          updatedAt: Date.now(),
          isStale: false,
        };
        this.notify(entry);
        return data;
      } catch (err) {
        if (!isCurrent()) throw err;
        entry.state = {
          ...entry.state,
          status: 'error',
          error: err as Error,
        };
        this.notify(entry);
        throw err;
      } finally {
        if (isCurrent()) {
          entry.inflight = null;
          entry.inflightController = null;
        }
      }
    })();

    entry.inflight = myPromise;
    return myPromise;
  }

  /**
   * Помечает запись как stale. Сами по себе данные не удаляются.
   * Если есть подписчики — они получат уведомление, чтобы инициировать refetch.
   */
  invalidate(predicate: QueryKey | ((key: QueryKey) => boolean)): string[] {
    const invalidated: string[] = [];
    const match =
      typeof predicate === 'function'
        ? predicate
        : (k: QueryKey) => matchQueryKey(predicate, k);

    for (const [hash, entry] of this.entries) {
      if (match(entry.key)) {
        entry.state = { ...entry.state, isStale: true };
        this.notify(entry);
        invalidated.push(hash);
      }
    }
    return invalidated;
  }

  /**
   * Перезапускает все записи, матчинг predicate, у которых сохранён
   * `lastQueryFn` (т.е. их хоть раз кто-то загрузил через `fetch`).
   * Возвращает promise, который резолвится когда все запросы завершились.
   * Ошибки отдельных запросов проглатываются — общий promise успешный.
   */
  refetchQueries(
    predicate: QueryKey | ((key: QueryKey) => boolean),
  ): Promise<void> {
    const match =
      typeof predicate === 'function'
        ? predicate
        : (k: QueryKey) => matchQueryKey(predicate, k);
    const promises: Promise<unknown>[] = [];
    for (const entry of this.entries.values()) {
      if (!match(entry.key)) continue;
      if (!entry.lastQueryFn) continue;
      promises.push(
        this.fetch(entry.key, entry.lastQueryFn, { force: true }).catch(
          () => undefined,
        ),
      );
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * Отменяет «привязку» inflight-промиса к ключу. Сам HTTP-запрос
   * продолжит исполняться (executeRequest не использует AbortSignal),
   * но его результат больше не попадёт в кэш и не уведомит подписчиков.
   * Полезно при размонтировании / при переключении страниц.
   */
  cancelQueries(predicate: QueryKey | ((key: QueryKey) => boolean)): void {
    const match =
      typeof predicate === 'function'
        ? predicate
        : (k: QueryKey) => matchQueryKey(predicate, k);
    for (const entry of this.entries.values()) {
      if (match(entry.key) && entry.inflight) {
        // реальная отмена HTTP: вызываем abort на сохранённом controller
        entry.inflightController?.abort();
        entry.inflightController = null;
        entry.inflight = null;
        (entry as QueryEntry<unknown> & { inflightToken?: symbol })
          .inflightToken = undefined;
        if (entry.state.status === 'loading') {
          entry.state = { ...entry.state, status: 'idle' };
          this.notify(entry);
        }
      }
    }
  }

  /**
   * Полностью удаляет записи (даже с активными подписчиками).
   * Используется редко — обычно достаточно invalidate.
   */
  remove(predicate: QueryKey | ((key: QueryKey) => boolean)): void {
    const match =
      typeof predicate === 'function'
        ? predicate
        : (k: QueryKey) => matchQueryKey(predicate, k);
    let removed = false;
    for (const [hash, entry] of [...this.entries]) {
      if (match(entry.key)) {
        if (entry.gcTimer) clearTimeout(entry.gcTimer);
        this.entries.delete(hash);
        removed = true;
      }
    }
    if (removed) this.notifyGlobal();
  }

  /**
   * Количество inflight-запросов в кэше, опционально отфильтрованных
   * по predicate. Используется `useIsFetching()` для глобального
   * индикатора загрузки.
   */
  countFetching(
    predicate?: QueryKey | ((key: QueryKey) => boolean),
  ): number {
    const match = !predicate
      ? () => true
      : typeof predicate === 'function'
      ? predicate
      : (k: QueryKey) => matchQueryKey(predicate, k);
    let n = 0;
    for (const entry of this.entries.values()) {
      // считаем по status === 'loading' (не по entry.inflight), потому что
      // notify летит до выставления inflight — иначе useIsFetching
      // пропустит начало запроса.
      if (entry.state.status === 'loading' && match(entry.key)) n++;
    }
    return n;
  }

  /** Только для тестов / DevTools. */
  _debugEntries(): ReadonlyMap<string, QueryEntry<unknown>> {
    return this.entries;
  }

  /**
   * Сериализует записи со статусом success — для persistence.
   * inflight / loading / error не сохраняются, чтобы не гидратировать
   * приложение в полу-загруженном состоянии.
   */
  dehydrate(filter?: (key: QueryKey) => boolean): DehydratedState {
    const queries: DehydratedQuery[] = [];
    for (const entry of this.entries.values()) {
      if (entry.state.status !== 'success') continue;
      if (entry.state.data === undefined) continue;
      if (filter && !filter(entry.key)) continue;
      queries.push({
        key: entry.key as unknown[],
        data: entry.state.data,
        updatedAt: entry.state.updatedAt,
      });
    }
    return { queries };
  }

  hydrate(state: DehydratedState): void {
    for (const q of state.queries) {
      const entry = this.ensureEntry<unknown>(q.key);
      // не перетираем более свежие данные
      if (entry.state.updatedAt >= q.updatedAt && entry.state.data !== undefined) {
        continue;
      }
      entry.state = {
        data: q.data,
        error: null,
        status: 'success',
        updatedAt: q.updatedAt,
        isStale: true, // гидратированные данные сразу stale → фоновый refetch
      };
      this.notify(entry);
    }
  }
}

export type DehydratedQuery = {
  key: unknown[];
  data: unknown;
  updatedAt: number;
};

export type DehydratedState = {
  queries: DehydratedQuery[];
};