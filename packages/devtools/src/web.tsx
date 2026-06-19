import {
  createElement,
  useCallback,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';

import {
  invalidateAll,
  useQueryClient,
  type QueryKey,
} from '@krymskyimaksym/react-api-client';

import { formatAge, formatKey, statusColor, statusLabel } from './format';
import { useCacheSnapshot } from './use-cache-snapshot';

export type CacheDevtoolsPanelProps = {
  /** Стартовое состояние панели. По умолчанию закрыта. */
  initialOpen?: boolean;
  /** Угол кнопки на экране. По умолчанию bottom-right. */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
};

/**
 * Веб-overlay DevTools: плавающая кнопка + панель снизу с таблицей
 * записей кэша. Подключай на верхнем уровне приложения под dev-флагом:
 *
 * @example
 * {process.env.NODE_ENV === 'development' && <CacheDevtoolsPanel />}
 */
export function CacheDevtoolsPanel({
  initialOpen = false,
  position = 'bottom-right',
}: CacheDevtoolsPanelProps = {}): ReactElement {
  const client = useQueryClient();
  const { entries, summary } = useCacheSnapshot();
  const [open, setOpen] = useState(initialOpen);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = entries.filter(
    e => !filter || formatKey(e.key).includes(filter),
  );

  const onAction = useCallback(
    (kind: 'invalidate' | 'remove' | 'refetch', key: QueryKey) => {
      if (kind === 'invalidate') client.invalidateQueries(key);
      else if (kind === 'remove') client.removeQueries(key);
      else void client.refetchQueries(key);
    },
    [client],
  );

  const buttonStyle: CSSProperties = {
    position: 'fixed',
    [position.includes('bottom') ? 'bottom' : 'top']: 16,
    [position.includes('right') ? 'right' : 'left']: 16,
    zIndex: 99999,
    padding: '8px 12px',
    borderRadius: 999,
    background: '#111827',
    color: '#fff',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  };

  if (!open) {
    return createElement(
      'button',
      {
        style: buttonStyle,
        onClick: () => setOpen(true),
        type: 'button',
      },
      `🗂 cache · ${summary.total}${summary.byStatus.loading > 0 ? ` · ${summary.byStatus.loading} fetching` : ''}`,
    );
  }

  return createElement(
    'div',
    {
      style: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        maxHeight: '50vh',
        background: '#fff',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        display: 'flex',
        flexDirection: 'column',
      } satisfies CSSProperties,
    },
    // header
    createElement(
      'div',
      {
        style: {
          padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        } satisfies CSSProperties,
      },
      createElement(
        'strong',
        { style: { fontSize: 13 } },
        '@krymskyimaksym/react-api-client devtools',
      ),
      Pill(`total ${summary.total}`),
      Pill(`fetching ${summary.byStatus.loading}`, '#0ea5e9'),
      Pill(`stale ${summary.stale}`, '#f59e0b'),
      Pill(`error ${summary.byStatus.error}`, '#dc2626'),
      Pill(`subscribed ${summary.withSubscribers}`, '#10b981'),
      createElement('input', {
        value: filter,
        onChange: (e: { currentTarget: { value: string } }) =>
          setFilter(e.currentTarget.value),
        placeholder: 'filter by key',
        style: {
          flex: 1,
          minWidth: 140,
          padding: '4px 8px',
          fontSize: 12,
          border: '1px solid #d1d5db',
          borderRadius: 4,
          fontFamily: 'inherit',
        } satisfies CSSProperties,
      }),
      ActionBtn('invalidate all', () => invalidateAll(client), '#fef3c7', '#92400e'),
      ActionBtn('close', () => setOpen(false), '#f3f4f6', '#374151'),
    ),
    // table
    createElement(
      'div',
      { style: { overflowY: 'auto', flex: 1 } satisfies CSSProperties },
      filtered.length === 0 &&
        createElement(
          'div',
          {
            style: {
              padding: 20,
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: 12,
            } satisfies CSSProperties,
          },
          'no entries',
        ),
      filtered.map(item =>
        createElement(
          'div',
          {
            key: item.hash,
            style: {
              padding: '8px 12px',
              borderBottom: '1px solid #f3f4f6',
              cursor: 'pointer',
              background: selected === item.hash ? '#f9fafb' : 'transparent',
            } satisfies CSSProperties,
            onClick: () => setSelected(selected === item.hash ? null : item.hash),
          },
          createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              } satisfies CSSProperties,
            },
            createElement('span', {
              style: {
                width: 8,
                height: 8,
                borderRadius: 4,
                background: statusColor(item),
                flexShrink: 0,
              } satisfies CSSProperties,
            }),
            createElement(
              'code',
              {
                style: {
                  flex: 1,
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                } satisfies CSSProperties,
              },
              formatKey(item.key),
            ),
            createElement(
              'span',
              {
                style: { fontSize: 11, color: '#6b7280' } satisfies CSSProperties,
              },
              `${statusLabel(item)} · ${item.subscribers}👤 · ${formatAge(item.updatedAt)}`,
            ),
          ),
          selected === item.hash &&
            createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  gap: 6,
                  marginTop: 6,
                } satisfies CSSProperties,
              },
              ActionBtn('refetch', () => onAction('refetch', item.key)),
              ActionBtn('invalidate', () => onAction('invalidate', item.key)),
              ActionBtn('remove', () => onAction('remove', item.key)),
            ),
          selected === item.hash &&
            item.errorMessage &&
            createElement(
              'div',
              {
                style: {
                  marginTop: 6,
                  color: '#dc2626',
                  fontSize: 11,
                } satisfies CSSProperties,
              },
              item.errorMessage,
            ),
        ),
      ),
    ),
  );
}

function Pill(label: string, color = '#6b7280') {
  return createElement(
    'span',
    {
      style: {
        padding: '2px 8px',
        borderRadius: 12,
        background: '#f3f4f6',
        color,
        fontSize: 11,
      } satisfies CSSProperties,
    },
    label,
  );
}

function ActionBtn(
  label: string,
  onClick: () => void,
  bg = '#e0e7ff',
  fg = '#3730a3',
) {
  return createElement(
    'button',
    {
      type: 'button',
      onClick,
      style: {
        padding: '4px 10px',
        borderRadius: 4,
        background: bg,
        color: fg,
        fontSize: 11,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
      } satisfies CSSProperties,
    },
    label,
  );
}
