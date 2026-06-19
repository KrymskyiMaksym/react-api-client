import { render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient, { apiMutation, useIsFetching, useIsMutating } from '../index';
import { configureApiClient } from '../config';
import { ApiClientProvider, QueryClient, setQueryClient } from '../query';
import type { IHttpClient } from '../types';

function makeHttpClient(
  get: ReturnType<typeof vi.fn>,
  request?: ReturnType<typeof vi.fn>,
): IHttpClient {
  return { get, request: request ?? vi.fn() };
}
function withProvider(ui: ReactNode, client: QueryClient) {
  return render(createElement(ApiClientProvider, { client }, ui));
}

describe('useIsFetching', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  it('считает inflight через cache.fetchQuery', async () => {
    let resolveFn: (v: unknown) => void = () => {};
    let count = -1;
    function Indicator() {
      count = useIsFetching();
      return null;
    }
    withProvider(createElement(Indicator), client);
    expect(count).toBe(0);

    const promise = client.fetchQuery(
      ['x'],
      () => new Promise(r => (resolveFn = r as (v: unknown) => void)),
    );

    await waitFor(() => expect(count).toBe(1));
    resolveFn({ v: 1 });
    await promise;
    await waitFor(() => expect(count).toBe(0));
  });

  it('useIsFetching(predicate) фильтрует по префиксу', async () => {
    let count = -1;
    function Indicator() {
      count = useIsFetching(['orders']);
      return null;
    }
    withProvider(createElement(Indicator), client);

    let resolveOrders: (v: unknown) => void = () => {};
    let resolveUsers: (v: unknown) => void = () => {};
    const p1 = client.fetchQuery(['orders', 1], () => new Promise(r => (resolveOrders = r as (v: unknown) => void)));
    const p2 = client.fetchQuery(['users', 1], () => new Promise(r => (resolveUsers = r as (v: unknown) => void)));

    await waitFor(() => expect(count).toBe(1)); // только orders
    resolveOrders(1);
    resolveUsers(2);
    await Promise.all([p1, p2]);
    await waitFor(() => expect(count).toBe(0));
  });
});

describe('useIsMutating', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  it('1 во время мутации, 0 после', async () => {
    let resolveFn: (v: unknown) => void = () => {};
    const request = vi.fn(
      () => new Promise(r => (resolveFn = r as (v: unknown) => void)),
    );
    configureApiClient({ httpClient: makeHttpClient(vi.fn(), request) });

    const api = apiMutation<{ ok: true }, { id: number }>('/x', {
      method: 'POST',
    });
    let count = -1;
    let mutateFn: ((v: { id: number }) => void) | null = null;
    function Probe() {
      count = useIsMutating();
      const m = api.useMutation();
      mutateFn = m.mutate;
      return null;
    }
    withProvider(createElement(Probe), client);

    expect(count).toBe(0);
    mutateFn!({ id: 1 });
    await waitFor(() => expect(count).toBe(1));
    resolveFn({ ok: true });
    await waitFor(() => expect(count).toBe(0));
  });
});
