/**
 * Глобальный менеджер сетевого статуса.
 * - В браузере подключается к window online/offline.
 * - В React Native интеграция — через NetInfo (опционально):
 *   `NetInfo.addEventListener(s => onlineManager.setOnline(!!s.isConnected))`.
 *   Жёсткой зависимости от NetInfo нет — без него по умолчанию online: true.
 *
 * Подписчики (useFetch с refetchOnReconnect) получают уведомление при
 * переходе offline → online.
 */
type Listener = (online: boolean) => void;

class OnlineManager {
  private online = true;
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

  isOnline(): boolean {
    return this.online;
  }

  setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    for (const l of this.listeners) l(online);
  }

  private setupBrowserListeners(): void {
    if (this.cleanup) return;
    if (
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function'
    ) {
      return;
    }
    // navigator.onLine может врать, но как initial state — ок
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      this.online = navigator.onLine;
    }
    const onOnline = () => this.setOnline(true);
    const onOffline = () => this.setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    this.cleanup = () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }

  private teardownBrowserListeners(): void {
    this.cleanup?.();
    this.cleanup = null;
  }
}

export const onlineManager = new OnlineManager();
export type { OnlineManager };
