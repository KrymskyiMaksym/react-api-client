import { act, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from '../index';
import { configureApiClient } from '../config';
import { ApiClientProvider, QueryClient, setQueryClient } from '../query';
import type { IHttpClient } from '../types';

function makeHttpClient(get: ReturnType<typeof vi.fn>): IHttpClient {
  return { get, request: vi.fn() };
}
function withProvider(ui: ReactNode, client: QueryClient) {
  return render(createElement(ApiClientProvider, { client }, ui));
}

describe('enabled: false — read-only слушатель кэша', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  it('не делает запрос, но отдаёт данные из кэша если они есть', async () => {
    const get = vi.fn().mockResolvedValue({ v: 42 });
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiClient<{ v: number }, void>('/x');

    // Writer наполняет кэш
    let writerData: unknown = null;
    function Writer() {
      const { data } = api.useFetch();
      writerData = data;
      return null;
    }
    // Reader работает с enabled: false
    let readerData: unknown = null;
    function Reader() {
      const { data } = api.useFetch(undefined, { enabled: false });
      readerData = data;
      return null;
    }

    withProvider(
      createElement('div', null, createElement(Writer), createElement(Reader)),
      client,
    );

    await waitFor(() => {
      expect(writerData).toMatchObject({ v: 42 });
      expect(readerData).toMatchObject({ v: 42 }); // отдало из кэша
    });
    expect(get).toHaveBeenCalledTimes(1); // только writer
  });

  it('перерисовывается на setQueryData снаружи', async () => {
    configureApiClient({ httpClient: makeHttpClient(vi.fn()) });
    const api = apiClient<{ count: number }, void>('/counter');

    let renderCount = 0;
    let lastData: unknown = null;
    function Reader() {
      const { data } = api.useFetch(undefined, { enabled: false });
      lastData = data;
      renderCount++;
      return null;
    }

    withProvider(createElement(Reader), client);
    const initialRenders = renderCount;
    expect(lastData).toBeNull();

    act(() => {
      // имитируем push-handler / другой экран
      client.setQueryData(['__endpoint__', '/counter', null], { count: 7 });
    });

    await waitFor(() => {
      expect(lastData).toMatchObject({ count: 7 });
    });
    expect(renderCount).toBeGreaterThan(initialRenders);
  });
});