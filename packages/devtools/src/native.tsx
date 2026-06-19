import { createElement, useCallback, useState } from 'react';

import {
  invalidateAll,
  useQueryClient,
  type CacheEntrySnapshot,
  type QueryKey,
} from '@krymskyimaksym/react-api-client';

import { formatAge, formatKey, statusColor, statusLabel } from './format';
import { useCacheSnapshot } from './use-cache-snapshot';

// react-native — optional peer. Импортируем динамически, чтобы web-сборка
// пакета не падала на разрешении модуля.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RN: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RN = require('react-native');
} catch {
  RN = null;
}

export type CacheDebugScreenProps = {
  /** Если задано — фильтрует записи только под этим префиксом ключа. */
  scope?: QueryKey;
};

/**
 * React Native debug-экран: список ключей кэша + действия.
 * Подключай в навигаторе под dev-флагом (`if (__DEV__) ...`).
 *
 * @example
 * <Stack.Screen name="cache" component={CacheDebugScreen} />
 */
export function CacheDebugScreen({ scope }: CacheDebugScreenProps = {}) {
  if (!RN) {
    throw new Error(
      '@krymskyimaksym/react-api-client-devtools/native: react-native не установлен',
    );
  }
  const { View, Text, FlatList, Pressable, ScrollView } = RN;

  const client = useQueryClient();
  const { entries, summary } = useCacheSnapshot();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = entries.filter(e => {
    if (scope && !startsWith(e.key, scope)) return false;
    if (filter && !formatKey(e.key).includes(filter)) return false;
    return true;
  });

  const onInvalidate = useCallback(
    (key: QueryKey) => client.invalidateQueries(key),
    [client],
  );
  const onRemove = useCallback(
    (key: QueryKey) => client.removeQueries(key),
    [client],
  );
  const onRefetch = useCallback(
    (key: QueryKey) => {
      void client.refetchQueries(key);
    },
    [client],
  );

  const renderItem = ({ item }: { item: CacheEntrySnapshot }) => {
    const isSelected = selected === item.hash;
    return createElement(
      Pressable,
      {
        onPress: () => setSelected(isSelected ? null : item.hash),
        style: {
          padding: 12,
          borderBottomWidth: 1,
          borderColor: '#e5e7eb',
          backgroundColor: isSelected ? '#f9fafb' : 'transparent',
        },
      },
      createElement(
        View,
        { style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
        createElement(View, {
          style: {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: statusColor(item),
          },
        }),
        createElement(
          Text,
          {
            style: { flex: 1, fontFamily: 'Menlo', fontSize: 12 },
            numberOfLines: 1,
          },
          formatKey(item.key),
        ),
        createElement(
          Text,
          { style: { fontSize: 11, color: '#6b7280' } },
          `${statusLabel(item)} · ${item.subscribers}👤 · ${formatAge(item.updatedAt)}`,
        ),
      ),
      isSelected &&
        createElement(
          View,
          { style: { flexDirection: 'row', gap: 8, marginTop: 8 } },
          ActionButton({
            label: 'refetch',
            onPress: () => onRefetch(item.key),
            View,
            Text,
            Pressable,
          }),
          ActionButton({
            label: 'invalidate',
            onPress: () => onInvalidate(item.key),
            View,
            Text,
            Pressable,
          }),
          ActionButton({
            label: 'remove',
            onPress: () => onRemove(item.key),
            View,
            Text,
            Pressable,
          }),
        ),
      isSelected &&
        item.errorMessage &&
        createElement(
          Text,
          { style: { marginTop: 8, color: '#dc2626', fontSize: 11 } },
          item.errorMessage,
        ),
    );
  };

  return createElement(
    View,
    { style: { flex: 1, backgroundColor: '#fff' } },
    createElement(
      View,
      {
        style: {
          padding: 12,
          borderBottomWidth: 1,
          borderColor: '#e5e7eb',
          gap: 8,
        },
      },
      createElement(
        ScrollView,
        { horizontal: true, showsHorizontalScrollIndicator: false },
        createElement(
          View,
          { style: { flexDirection: 'row', gap: 8 } },
          Pill({ label: `total ${summary.total}`, View, Text }),
          Pill({
            label: `fetching ${summary.byStatus.loading}`,
            color: '#0ea5e9',
            View,
            Text,
          }),
          Pill({
            label: `stale ${summary.stale}`,
            color: '#f59e0b',
            View,
            Text,
          }),
          Pill({
            label: `error ${summary.byStatus.error}`,
            color: '#dc2626',
            View,
            Text,
          }),
          Pill({
            label: `subscribed ${summary.withSubscribers}`,
            color: '#10b981',
            View,
            Text,
          }),
        ),
      ),
      createElement(RN.TextInput, {
        value: filter,
        onChangeText: setFilter,
        placeholder: 'filter by key',
        style: {
          borderWidth: 1,
          borderColor: '#e5e7eb',
          borderRadius: 6,
          padding: 8,
          fontSize: 12,
          fontFamily: 'Menlo',
        },
      }),
      createElement(
        Pressable,
        {
          onPress: () => invalidateAll(client),
          style: {
            alignSelf: 'flex-start',
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 6,
            backgroundColor: '#fef3c7',
          },
        },
        createElement(
          Text,
          { style: { fontSize: 12, color: '#92400e' } },
          'invalidate all',
        ),
      ),
    ),
    createElement(FlatList, {
      data: filtered,
      keyExtractor: (item: CacheEntrySnapshot) => item.hash,
      renderItem,
    }),
  );
}

function startsWith(key: readonly unknown[], prefix: readonly unknown[]) {
  if (prefix.length > key.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (JSON.stringify(key[i]) !== JSON.stringify(prefix[i])) return false;
  }
  return true;
}

function Pill({
  label,
  color = '#6b7280',
  View,
  Text,
}: {
  label: string;
  color?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  View: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Text: any;
}) {
  return createElement(
    View,
    {
      style: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: '#f3f4f6',
      },
    },
    createElement(
      Text,
      { style: { fontSize: 11, color } },
      label,
    ),
  );
}

function ActionButton({
  label,
  onPress,
  View,
  Text,
  Pressable,
}: {
  label: string;
  onPress: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  View: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Text: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Pressable: any;
}) {
  return createElement(
    Pressable,
    {
      onPress,
      style: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: '#e0e7ff',
      },
    },
    createElement(
      View,
      null,
      createElement(
        Text,
        { style: { fontSize: 11, color: '#3730a3' } },
        label,
      ),
    ),
  );
}
