import { act, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMutation } from '../index';
import apiClient from '../index';
import { configureApiClient } from '../config';
import {
  ApiClientProvider,
  QueryClient,
  setQueryClient,
} from '../query';
import type { IHttpClient } from '../types';

function makeHttpClient(
  get: ReturnType<typeof vi.fn>,
  request: ReturnType<typeof vi.fn>,
): IHttpClient {
  return { get, request };
}

function withProvider(ui: ReactNode, client: QueryClient) {
  return render(createElement(ApiClientProvider, { client }, ui));
}

describe('useMutation (phase 3)', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  it('invalidateKeys: после успеха подписанный useFetch перерефетчит', async () => {
    let counter = 0;
    const get = vi
      .fn()
      .mockImplementation(() => Promise.resolve({ n: ++counter }));
    const request = vi.fn().mockResolvedValue({ ok: true });
    configureApiClient({ httpClient: makeHttpClient(get, request) });

    const listApi = apiClient<{ n: number }, void>('/orders');
    const confirmApi = apiMutation<{ ok: true }, { id: number }>(
      '/orders/confirm',
      { method: 'POST' },
    );

    let mutateFn: ((v: { id: number }) => void) | null = null;
    function Screen() {
      listApi.useFetch(undefined, { staleTime: 60_000 });
      const { mutate } = confirmApi.useMutation({
        invalidateKeys: [['__endpoint__', '/orders']],
      });
      mutateFn = mutate;
      return null;
    }

    withProvider(createElement(Screen), client);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => {
      mutateFn!({ id: 1 });
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('setQueryData: точечный патч кэша после успеха', async () => {
    const get = vi.fn().mockResolvedValue({ id: 5, name: 'old' });
    const request = vi.fn().mockResolvedValue({ id: 5, name: 'new' });
    configureApiClient({ httpClient: makeHttpClient(get, request) });

    const orderApi = apiClient<{ id: number; name: string }, void>('/order/5');
    const updateApi = apiMutation<
      { id: number; name: string },
      { name: string }
    >('/order/5', { method: 'PATCH' });

    let lastSeen: { id: number; name: string } | null = null;
    let mutateFn: ((v: { name: string }) => void) | null = null;
    function Screen() {
      const { data } = orderApi.useFetch();
      if (data) lastSeen = { id: data.id, name: data.name };
      const { mutate } = updateApi.useMutation({
        setQueryData: (c, _vars, result) => {
          c.setQueryData(['__endpoint__', '/order/5', null], result);
        },
      });
      mutateFn = mutate;
      return null;
    }

    withProvider(createElement(Screen), client);
    await waitFor(() => expect(lastSeen?.name).toBe('old'));

    act(() => {
      mutateFn!({ name: 'new' });
    });
    await waitFor(() => expect(lastSeen?.name).toBe('new'));
    // запрос на /order/5 не повторялся — только PATCH
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('onMutate возвращает context; onError получает его (rollback-сценарий)', async () => {
    const get = vi.fn();
    const request = vi.fn().mockRejectedValue({
      response: { status: 500, data: { message: 'boom' } },
    });
    configureApiClient({ httpClient: makeHttpClient(get, request) });

    const api = apiMutation<unknown, { id: number }>('/x', { method: 'POST' });

    const onMutate = vi.fn().mockReturnValue({ snapshot: 'before' });
    const onError = vi.fn();

    let mutateAsyncFn: ((v: { id: number }) => Promise<unknown>) | null = null;
    function Screen() {
      const { mutateAsync } = api.useMutation<{ snapshot: string }>({
        onMutate,
        onError,
      });
      mutateAsyncFn = mutateAsync;
      return null;
    }

    withProvider(createElement(Screen), client);

    await act(async () => {
      // executeRequest конвертит 500 в { status: false } — это бизнес-ошибка
      await mutateAsyncFn!({ id: 1 });
    });

    expect(onMutate).toHaveBeenCalledWith({ id: 1 });
    expect(onError).toHaveBeenCalled();
    const [, vars, ctx] = onError.mock.calls[0];
    expect(vars).toEqual({ id: 1 });
    expect(ctx).toEqual({ snapshot: 'before' });
  });
});
