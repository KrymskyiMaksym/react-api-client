import type { CacheEntrySnapshot } from '@krymskyimaksym/react-api-client';

export function formatKey(key: readonly unknown[]): string {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

export function formatAge(updatedAt: number): string {
  if (!updatedAt) return '—';
  const seconds = Math.round((Date.now() - updatedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export function statusColor(snap: CacheEntrySnapshot): string {
  if (snap.status === 'error') return '#dc2626';
  if (snap.hasInflight) return '#0ea5e9';
  if (snap.isStale) return '#f59e0b';
  if (snap.status === 'success') return '#10b981';
  return '#6b7280';
}

export function statusLabel(snap: CacheEntrySnapshot): string {
  if (snap.status === 'error') return 'error';
  if (snap.hasInflight) return 'fetching';
  if (snap.isStale) return 'stale';
  if (snap.status === 'success') return 'fresh';
  return 'idle';
}
