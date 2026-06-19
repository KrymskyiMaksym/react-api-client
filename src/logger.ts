import { getConfig, isConfigured } from './config';
import type { ApiClientLogger } from './types';

/**
 * Безопасный доступ к logger из глобального конфига: ошибки колбэков
 * проглатываются, отсутствие конфига/логгера — no-op.
 */
function getLogger(): ApiClientLogger | undefined {
  if (!isConfigured()) return undefined;
  return getConfig().logger;
}

export function callLogger<K extends keyof ApiClientLogger>(
  method: K,
  ...args: Parameters<NonNullable<ApiClientLogger[K]>>
): void {
  const logger = getLogger();
  const fn = logger?.[method] as
    | ((...a: Parameters<NonNullable<ApiClientLogger[K]>>) => void)
    | undefined;
  if (!fn) return;
  try {
    fn(...args);
  } catch {
    // логгер не должен ломать приложение
  }
}
