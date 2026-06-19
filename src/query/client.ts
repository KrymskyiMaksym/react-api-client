import { callLogger } from '../logger';
import { QueryCache, type FetchOptions, type QueryFn } from './cache';
import type { QueryKey } from './key';
import { mutationCounter } from './mutation-counter';

/**
 * Высокоуровневый фасад над QueryCache: единый объект, который удобно
 * прокидывать через Provider и дергать из push-handler'ов / эффектов.
 *
 * Сами queryFn-ы здесь не регистрируются — refetchQueries требует, чтобы
 * либо подписчик сам перезапустил запрос (через subscribe), либо чтобы
 * вызвали fetchQuery с queryFn вручную. Это намеренно: хук React сам
 * знает, как собрать свой queryFn из endpoint/params.
 */
export class QueryClient {
  readonly cache: QueryCache;

  constructor(cache?: QueryCache) {
    this.cache = cache ?? new QueryCache();
  }

  getQueryData<T>(key: QueryKey): T | undefined {
    return this.cache.getData<T>(key);
  }

  /**
   * Точечно патчит данные под ключом. Возвращает новое значение —
   * удобно для «пропатчил → передал дальше».
   */
  setQueryData<T>(
    key: QueryKey,
    updater: T | ((prev: T | undefined) => T),
  ): T {
    return this.cache.setData(key, updater);
  }

  fetchQuery<T>(
    key: QueryKey,
    queryFn: QueryFn<T>,
    options?: FetchOptions,
  ): Promise<T> {
    return this.cache.fetch(key, queryFn, options);
  }

  invalidateQueries(
    predicate: QueryKey | ((key: QueryKey) => boolean),
  ): void {
    const hashes = this.cache.invalidate(predicate);
    if (hashes.length > 0) callLogger('onInvalidate', hashes);
  }

  removeQueries(predicate: QueryKey | ((key: QueryKey) => boolean)): void {
    this.cache.remove(predicate);
  }

  cancelQueries(predicate: QueryKey | ((key: QueryKey) => boolean)): void {
    this.cache.cancelQueries(predicate);
  }

  /**
   * Отменяет inflight-мутации через `AbortSignal`. Без аргумента — все.
   * С префиксом QueryKey или функцией-предикатом — только матчинг
   * (scope мутации = первый ключ из её `invalidateKeys`, если задан массив).
   *
   * Если `httpClient` уважает `signal` — HTTP-запрос реально прерывается;
   * иначе результат отменённой мутации просто не повлияет на UI
   * (`useMutation` останется в текущем состоянии).
   *
   * Типичный кейс — logout: `client.cancelMutations()` перед очисткой
   * сессии, чтобы поздние ответы не сработали.
   */
  cancelMutations(
    predicate?: QueryKey | ((scope: QueryKey | undefined) => boolean),
  ): void {
    mutationCounter.cancel(predicate);
  }

  refetchQueries(
    predicate: QueryKey | ((key: QueryKey) => boolean),
  ): Promise<void> {
    return this.cache.refetchQueries(predicate);
  }

  /**
   * Кладёт запрос в кэш, не пробрасывая ошибки. Подходит для
   * оптимистичной подгрузки следующего экрана при наведении / долгом тапе.
   *
   * Поведение:
   * - **`staleTime`**: учитывается. Если данные ещё свежие — запрос не
   *   отправляется, promise резолвится сразу.
   * - **`inflight`**: если по ключу уже идёт запрос, prefetch присоединяется
   *   к нему (dedupe). Не создаёт второй HTTP-вызов.
   * - **Подписчики**: если на ключ подписан `useFetch`, успешный prefetch
   *   обновит его `data` (через notify подписчиков). При ошибке — статус
   *   подписчика тоже обновится (`error`).
   * - **Возвращаемый promise**: всегда успешный — ошибки не пробрасываются.
   */
  prefetchQuery<T>(
    key: QueryKey,
    queryFn: QueryFn<T>,
    options?: FetchOptions,
  ): Promise<void> {
    return this.cache.fetch(key, queryFn, options).then(
      () => undefined,
      () => undefined,
    );
  }
}

let globalClient: QueryClient | null = null;

/** Singleton-доступ для тех мест, где Provider недоступен (push-handler и т.п.). */
export function getQueryClient(): QueryClient {
  if (!globalClient) globalClient = new QueryClient();
  return globalClient;
}

export function setQueryClient(client: QueryClient): void {
  globalClient = client;
}