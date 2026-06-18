import { act, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from '../index';
import { configureApiClient } from '../config';
import {
  ApiClientProvider,
  QueryCache,
  QueryClient,
  onlineManager,
  setQueryClient,
} from '../query';
import type { IHttpClient } from '../types';

function makeHttpClient(get: ReturnType<typeof vi.fn>): IHttpClient {
  return { get, request: vi.fn() };
}
function withProvider(ui: ReactNode, client: QueryClient) {
  return render(createElement(ApiClientProvider, { client }, ui));
}

describe('Фаза 5: сеть', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  it('cancelQueries: результат отменённого inflight не попадает в кэш', async () => {
    const cache = new QueryCache();
    let resolveFn: (v: unknown) => void = () => {};
    const queryFn = vi
      .fn()
      .mockImplementation(() => new Promise(r => (resolveFn = r)));

    const p = cache.fetch(['k'], queryFn);
    cache.cancelQueries(['k']);
    resolveFn({ data: 'late' });
    await p;

    expect(cache.getData(['k'])).toBeUndefined();
    expect(cache.getState(['k'])?.status).toBe('idle');
  });

  it('refetchOnReconnect: запрос при offline → online', async () => {
    const get = vi.fn().mockResolvedValue({ v: 1 });
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiClient<{ v: number }, void>('/poll');
    function Probe() {
      api.useFetch(undefined, { refetchOnReconnect: true });
      return null;
    }

    withProvider(createElement(Probe), client);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
