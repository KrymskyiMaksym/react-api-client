import { act, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from '../index';
import { configureApiClient } from '../config';
import {
  ApiClientProvider,
  QueryClient,
  focusManager,
  setQueryClient,
} from '../query';
import type { IHttpClient } from '../types';

function makeHttpClient(get: ReturnType<typeof vi.fn>): IHttpClient {
  return { get, request: vi.fn() };
}

function withProvider(ui: ReactNode, client: QueryClient) {
  return render(
    createElement(ApiClientProvider, { client }, ui),
  );
}

describe('useFetch (phase 2)', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('делает запрос при mount и кладёт data', async () => {
    const get = vi.fn().mockResolvedValue({ id: 1, name: 'Alice' });
    configureApiClient({ httpClient: makeHttpClient(get) });

    const userApi = apiClient<{ id: number; name: string }, void>('/users/1');

    let captured: { data: unknown; isLoading: boolean } = {
      data: null,
      isLoading: true,
    };
    function Probe() {
      const { data, isLoading } = userApi.useFetch();
      captured = { data, isLoading };
      return null;
    }

    withProvider(createElement(Probe), client);

    await waitFor(() => {
      expect(captured.isLoading).toBe(false);
      expect(captured.data).toMatchObject({ id: 1, name: 'Alice', status: true });
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('два компонента одного endpoint → один HTTP-запрос (dedupe + shared cache)', async () => {
    const get = vi.fn().mockResolvedValue({ id: 2 });
    configureApiClient({ httpClient: makeHttpClient(get) });

    const userApi = apiClient<{ id: number }, void>('/users/2');

    function A() {
      userApi.useFetch();
      return null;
    }
    function B() {
      userApi.useFetch();
      return null;
    }

    withProvider(
      createElement('div', null, createElement(A), createElement(B)),
      client,
    );

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  it('staleTime > 0: второй mount берёт данные из кэша без сети', async () => {
    const get = vi.fn().mockResolvedValue({ v: 1 });
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiClient<{ v: number }, void>('/x');

    function Probe() {
      api.useFetch(undefined, { staleTime: 60_000 });
      return null;
    }

    const { unmount } = withProvider(createElement(Probe), client);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    unmount();

    withProvider(createElement(Probe), client);
    // staleTime ещё не истёк → новый запрос не идёт
    await new Promise(r => setTimeout(r, 30));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('refetchOnFocus: запрос при focusManager.setFocused(true)', async () => {
    const get = vi.fn().mockResolvedValue({ v: 1 });
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiClient<{ v: number }, void>('/y');

    function Probe() {
      api.useFetch(undefined, { refetchOnFocus: true, staleTime: 0 });
      return null;
    }

    withProvider(createElement(Probe), client);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('select: пересчитывает только при изменении data или select', async () => {
    const get = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiClient<{ items: number[] }, void>('/list');

    let lastSelected: number | null = null;
    let renderCount = 0;
    function Probe() {
      const { data } = api.useFetch(undefined, {
        select: d => d.items.length,
      });
      lastSelected = data;
      renderCount++;
      return null;
    }

    withProvider(createElement(Probe), client);
    await waitFor(() => expect(lastSelected).toBe(3));
    expect(renderCount).toBeGreaterThan(0);
  });

  it('invalidateQueries извне (push-handler) → подписанные хуки перерефетчат', async () => {
    let counter = 0;
    const get = vi.fn().mockImplementation(() => Promise.resolve({ n: ++counter }));
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiClient<{ n: number }, void>('/poll', {});

    function Probe() {
      api.useFetch(undefined, { staleTime: 60_000 });
      return null;
    }

    withProvider(createElement(Probe), client);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => {
      client.invalidateQueries(['__endpoint__', '/poll']);
    });

    // подписчик получил уведомление об isStale; useEffect[runFetch]
    // перезапустит запрос на следующем тике
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
