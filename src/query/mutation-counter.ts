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
class MutationCounter {
  private active = new Map<symbol, QueryKey | undefined>();
  private listeners = new Set<Listener>();

  start(scope?: QueryKey): symbol {
    const id = Symbol('mutation');
    this.active.set(id, scope);
    this.notify();
    return id;
  }

  stop(id: symbol): void {
    if (this.active.delete(id)) this.notify();
  }

  count(predicate?: QueryKey | ((scope: QueryKey | undefined) => boolean)): number {
    if (!predicate) return this.active.size;
    let n = 0;
    for (const scope of this.active.values()) {
      if (typeof predicate === 'function') {
        if (predicate(scope)) n++;
      } else {
        if (scope && matchQueryKey(predicate, scope)) n++;
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
