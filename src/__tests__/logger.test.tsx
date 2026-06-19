import { act, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient, { apiMutation } from '../index';
import { configureApiClient } from '../config';
import {
  ApiClientProvider,
  QueryClient,
  setQueryClient,
} from '../query';
import type { ApiClientLogger, IHttpClient } from '../types';

function makeHttpClient(
  get: ReturnType<typeof vi.fn>,
  request?: ReturnType<typeof vi.fn>,
): IHttpClient {
  return { get, request: request ?? vi.fn() };
}
function withProvider(ui: ReactNode, client: QueryClient) {
  return render(createElement(ApiClientProvider, { client }, ui));
}

describe('logger', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  it('onFetchStart/Success вызываются для useFetch', async () => {
    const logger: ApiClientLogger = {
      onFetchStart: vi.fn(),
      onFetchSuccess: vi.fn(),
      onFetchError: vi.fn(),
    };
    const get = vi.fn().mockResolvedValue({ v: 1 });
    configureApiClient({ httpClient: makeHttpClient(get), logger });

    const api = apiClient<{ v: number }, void>('/x');
    function Probe() {
      api.useFetch();
      return null;
    }
    withProvider(createElement(Probe), client);

    await waitFor(() => {
      expect(logger.onFetchStart).toHaveBeenCalled();
      expect(logger.onFetchSuccess).toHaveBeenCalled();
    });
    expect(logger.onFetchError).not.toHaveBeenCalled();
  });

  it('onInvalidate вызывается с массивом hash-ей', () => {
    const onInvalidate = vi.fn();
    configureApiClient({
      httpClient: makeHttpClient(vi.fn()),
      logger: { onInvalidate },
    });
    client.setQueryData(['k', 1], 'v');
    client.invalidateQueries(['k']);

    expect(onInvalidate).toHaveBeenCalled();
    const hashes = onInvalidate.mock.calls[0][0] as string[];
    expect(Array.isArray(hashes)).toBe(true);
    expect(hashes.length).toBe(1);
  });

  it('onMutationStart/Success вызываются с endpoint и vars', async () => {
    const onMutationStart = vi.fn();
    const onMutationSuccess = vi.fn();
    const request = vi.fn().mockResolvedValue({ ok: true });
    configureApiClient({
      httpClient: makeHttpClient(vi.fn(), request),
      logger: { onMutationStart, onMutationSuccess },
    });

    const api = apiMutation<{ ok: true }, { id: number }>('/touch', {
      method: 'POST',
    });
    let mutateFn: ((v: { id: number }) => void) | null = null;
    function Probe() {
      mutateFn = api.useMutation().mutate;
      return null;
    }
    withProvider(createElement(Probe), client);

    await act(async () => {
      mutateFn!({ id: 1 });
    });
    await waitFor(() => expect(onMutationSuccess).toHaveBeenCalled());

    expect(onMutationStart).toHaveBeenCalledWith('/touch', { id: 1 });
    const [endpoint, vars, data] = onMutationSuccess.mock.calls[0];
    expect(endpoint).toBe('/touch');
    expect(vars).toEqual({ id: 1 });
    expect(data).toMatchObject({ ok: true, status: true });
  });

  it('ошибка внутри logger не ломает приложение', async () => {
    const get = vi.fn().mockResolvedValue({ v: 1 });
    configureApiClient({
      httpClient: makeHttpClient(get),
      logger: {
        onFetchSuccess: () => {
          throw new Error('logger boom');
        },
      },
    });

    const api = apiClient<{ v: number }, void>('/x');
    let captured: unknown = null;
    function Probe() {
      const { data } = api.useFetch();
      captured = data;
      return null;
    }
    withProvider(createElement(Probe), client);
    await waitFor(() => {
      expect(captured).toMatchObject({ v: 1, status: true });
    });
  });
});
