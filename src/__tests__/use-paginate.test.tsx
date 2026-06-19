import { act, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient, { apiMutation, apiPaginate } from '../index';
import { configureApiClient } from '../config';
import {
  ApiClientProvider,
  QueryClient,
  setQueryClient,
} from '../query';
import type { IHttpClient, UsePaginateResult } from '../types';

function makeHttpClient(get: ReturnType<typeof vi.fn>): IHttpClient {
  return { get, request: vi.fn() };
}

function withProvider(ui: ReactNode, client: QueryClient) {
  return render(createElement(ApiClientProvider, { client }, ui));
}

type ListResponse = { data: { id: number }[]; total: number };

describe('usePaginate (phase 4)', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  it('первая страница приходит и парсится', async () => {
    const get = vi.fn().mockImplementation((_url: string, cfg: { params: { page: number } }) =>
      Promise.resolve({
        data: [{ id: cfg.params.page * 10 + 1 }, { id: cfg.params.page * 10 + 2 }],
        total: 42,
      } as ListResponse),
    );
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiPaginate<ListResponse, { id: number }[]>('/orders');

    let snapshot: UsePaginateResult<{ id: number }[]> | null = null;
    function Probe() {
      snapshot = api.usePaginate(undefined, { initialLimit: 10 });
      return null;
    }
    withProvider(createElement(Probe), client);

    await waitFor(() => {
      expect(snapshot?.data.length).toBe(2);
      expect(snapshot?.total).toBe(42);
      expect(snapshot?.totalPages).toBe(5);
      expect(snapshot?.hasNextPage).toBe(true);
    });
  });

  it('fetchNextPage кэширует обе страницы; возврат на предыдущую — без сети', async () => {
    const get = vi.fn().mockImplementation((_url, cfg: { params: { page: number } }) =>
      Promise.resolve({
        data: [{ id: cfg.params.page }],
        total: 100,
      } as ListResponse),
    );
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiPaginate<ListResponse, { id: number }[]>('/orders');

    let snapshot: UsePaginateResult<{ id: number }[]> | null = null;
    function Probe() {
      snapshot = api.usePaginate(undefined, {
        initialLimit: 10,
        staleTime: 60_000,
      });
      return null;
    }
    withProvider(createElement(Probe), client);
    await waitFor(() => expect(snapshot?.data[0]?.id).toBe(1));

    await act(async () => {
      await snapshot!.fetchNextPage();
    });
    await waitFor(() => expect(snapshot?.currentPage).toBe(2));
    expect(get).toHaveBeenCalledTimes(2);

    await act(async () => {
      await snapshot!.fetchPreviousPage();
    });
    await waitFor(() => expect(snapshot?.currentPage).toBe(1));
    // первая страница уже в кэше → сетевого запроса не было
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('invalidateKeys по префиксу пагинации инвалидирует ВСЕ страницы', async () => {
    void apiClient;
    const get = vi.fn().mockImplementation((url: string, cfg: { params: { page: number } }) => {
      if (url === '/touch') return Promise.resolve({ ok: true });
      return Promise.resolve({
        data: [{ id: cfg.params.page }],
        total: 100,
      } as ListResponse);
    });
    const request = vi.fn().mockResolvedValue({ ok: true });
    configureApiClient({
      httpClient: { get, request } as IHttpClient,
    });

    const api = apiPaginate<ListResponse, { id: number }[]>('/orders');
    const touch = apiMutation<{ ok: true }, void>('/touch', { method: 'POST' });

    let snap: UsePaginateResult<{ id: number }[]> | null = null;
    let mutateFn: (() => void) | null = null;
    function Screen() {
      snap = api.usePaginate(undefined, {
        initialLimit: 10,
        staleTime: 60_000,
      });
      mutateFn = touch.useMutation({
        invalidateKeys: [['__paginate__', '/orders']],
      }).mutate;
      return null;
    }

    withProvider(createElement(Screen), client);
    await waitFor(() => expect(snap?.data[0]?.id).toBe(1));

    // загружаем 2-ю страницу
    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.currentPage).toBe(2));
    expect(get).toHaveBeenCalledTimes(2);

    // mutate → должно пометить обе страницы stale → текущая (2) рефетчится
    await act(async () => {
      mutateFn!();
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
  });

  it('prefetchNextPage кладёт страницу в кэш не меняя currentPage', async () => {
    const get = vi.fn().mockImplementation((_url, cfg: { params: { page: number } }) =>
      Promise.resolve({
        data: [{ id: cfg.params.page }],
        total: 100,
      } as ListResponse),
    );
    configureApiClient({ httpClient: makeHttpClient(get) });

    const api = apiPaginate<ListResponse, { id: number }[]>('/orders');

    let snapshot: UsePaginateResult<{ id: number }[]> | null = null;
    function Probe() {
      snapshot = api.usePaginate(undefined, {
        initialLimit: 10,
        staleTime: 60_000,
      });
      return null;
    }
    withProvider(createElement(Probe), client);
    await waitFor(() => expect(snapshot?.data[0]?.id).toBe(1));

    await act(async () => {
      await snapshot!.prefetchNextPage();
    });
    expect(snapshot?.currentPage).toBe(1);
    expect(get).toHaveBeenCalledTimes(2);

    await act(async () => {
      await snapshot!.fetchNextPage();
    });
    // сетевой запрос не должен повториться — берём из кэша
    expect(get).toHaveBeenCalledTimes(2);
    expect(snapshot?.currentPage).toBe(2);
  });
});
