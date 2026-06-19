import { matchQueryKey, type QueryKey } from './key';

type Listener = () => void;

/**
 * Глобальный счётчик активных мутаций. Используется `useIsMutating()`
 * для глобального индикатора загрузки.
 *
 * Мутации не имеют ключа в кэше (в отличие от запросов), поэтому
 * счётчик ведётся отдельно. Каждой активной мутации можно опционально
 * приписать `scope` (QueryKey) — это позволяет `useIsMutating(prefix)`
 * фильтровать по предметной области.
 */
type MutationRecord = {
  scope: QueryKey | undefined;
  controller: AbortController;
};

class MutationCounter {
  private active = new Map<symbol, MutationRecord>();
  private listeners = new Set<Listener>();

  start(scope?: QueryKey, controller?: AbortController): symbol {
    const id = Symbol('mutation');
    this.active.set(id, { scope, controller: controller ?? new AbortController() });
    this.notify();
    return id;
  }

  stop(id: symbol): void {
    if (this.active.delete(id)) this.notify();
  }

  /**
   * Отменяет inflight-мутации. Без predicate — все.
   * С predicate (префикс QueryKey или функция-предикат scope'а) —
   * только матчинг.
   */
  cancel(predicate?: QueryKey | ((scope: QueryKey | undefined) => boolean)): void {
    for (const rec of this.active.values()) {
      if (!predicate) {
        rec.controller.abort();
        continue;
      }
      if (typeof predicate === 'function') {
        if (predicate(rec.scope)) rec.controller.abort();
      } else if (rec.scope && matchQueryKey(predicate, rec.scope)) {
        rec.controller.abort();
      }
    }
  }

  count(predicate?: QueryKey | ((scope: QueryKey | undefined) => boolean)): number {
    if (!predicate) return this.active.size;
    let n = 0;
    for (const rec of this.active.values()) {
      if (typeof predicate === 'function') {
        if (predicate(rec.scope)) n++;
      } else {
        if (rec.scope && matchQueryKey(predicate, rec.scope)) n++;
      }
    }
    return n;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const l of this.listeners) l();
  }
}

export const mutationCounter = new MutationCounter();
export type { MutationCounter };
