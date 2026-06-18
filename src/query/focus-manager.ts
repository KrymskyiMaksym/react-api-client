/**
 * Глобальный менеджер «фокуса» приложения.
 * - В вебе автоматически подключается к window focus/visibilitychange.
 * - В React Native интеграцию ставит сам потребитель через
 *   `focusManager.setFocused(state === 'active')` из AppState.
 *
 * Подписчики (useFetch с refetchOnFocus / refetchOnAppActive) получают
 * уведомление при переходе в focused == true.
 */
type Listener = (focused: boolean) => void;

class FocusManager {
  private focused = true;
  private listeners = new Set<Listener>();
  private cleanup: (() => void) | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.setupBrowserListeners();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.teardownBrowserListeners();
    };
  }

  isFocused(): boolean {
    return this.focused;
  }

  setFocused(focused: boolean): void {
    if (this.focused === focused) return;
    this.focused = focused;
    for (const l of this.listeners) l(focused);
  }

  private setupBrowserListeners(): void {
    if (this.cleanup) return;
    if (
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function'
    ) {
      return;
    }
    const onFocus = () => this.setFocused(true);
    const onVisibility = () => {
      if (typeof document !== 'undefined') {
        this.setFocused(document.visibilityState !== 'hidden');
      }
    };
    window.addEventListener('focus', onFocus);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    this.cleanup = () => {
      window.removeEventListener('focus', onFocus);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }

  private teardownBrowserListeners(): void {
    this.cleanup?.();
    this.cleanup = null;
  }
}

export const focusManager = new FocusManager();
export type { FocusManager };
