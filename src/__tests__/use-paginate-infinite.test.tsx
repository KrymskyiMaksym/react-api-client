import { act, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMutation, apiPaginate } from '../index';
import { configureApiClient } from '../config';
import {
  ApiClientProvider,
  QueryClient,
  setQueryClient,
} from '../query';
import type { IHttpClient, UsePaginateResult } from '../types';

type Item = { id: number };
type ListResponse = { data: Item[]; total: number };

function makeHttpClient(get: ReturnType<typeof vi.fn>): IHttpClient {
  return { get, request: vi.fn() };
}
function withProvider(ui: ReactNode, client: QueryClient) {
  return render(createElement(ApiClientProvider, { client }, ui));
}

/** Бэкенд: страница N возвращает [{id: N*10+1}, {id: N*10+2}]. total = 100. */
function makePagedGet() {
  return vi
    .fn()
    .mockImplementation((_url: string, cfg: { params: { page: number } }) =>
      Promise.resolve({
        data: [
          { id: cfg.params.page * 10 + 1 },
          { id: cfg.params.page * 10 + 2 },
        ],
        total: 100,
      } as ListResponse),
    );
}

describe('usePaginate mode: infinite', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    setQueryClient(client);
  });

  it('fetchNextPage добавляет в конец, не заменяет', async () => {
    const get = makePagedGet();
    configureApiClient({ httpClient: makeHttpClient(get) });
    const api = apiPaginate<ListResponse, Item[]>('/items');

    let snap: UsePaginateResult<Item[]> | null = null;
    function Probe() {
      snap = api.usePaginate(undefined, {
        initialLimit: 2,
        mode: 'infinite',
      });
      return null;
    }
    withProvider(createElement(Probe), client);

    await waitFor(() => expect(snap?.data.length).toBe(2));
    expect(snap?.data.map(i => i.id)).toEqual([11, 12]);

    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.data.length).toBe(4));
    expect(snap?.data.map(i => i.id)).toEqual([11, 12, 21, 22]);

    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.data.length).toBe(6));
    expect(snap?.data.map(i => i.id)).toEqual([11, 12, 21, 22, 31, 32]);
  });

  it('смена params очищает аккумулятор и грузит первую страницу', async () => {
    const get = makePagedGet();
    configureApiClient({ httpClient: makeHttpClient(get) });
    const api = apiPaginate<ListResponse, Item[], { q: string }>('/search');

    let snap: UsePaginateResult<Item[]> | null = null;
    let setQ: ((q: string) => void) | null = null;
    function Probe() {
      const [q, sq] = useState('a');
      setQ = sq;
      snap = api.usePaginate({ q }, { initialLimit: 2, mode: 'infinite' });
      return null;
    }
    withProvider(createElement(Probe), client);

    await waitFor(() => expect(snap?.data.length).toBe(2));
    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.data.length).toBe(4));

    act(() => {
      setQ!('b');
    });
    await waitFor(() => expect(snap?.data.length).toBe(2));
  });

  it('зміна params ЛИШЕ СТОЯЧИ на першій сторінці — підписка перевʼязується на новий запис кешу (без проміжного fetchNextPage)', async () => {
    // Це той самий сценарій, що й у сусідньому тесті ('смена params
    // очищает аккумулятор...'), але БЕЗ проміжного fetchNextPage — тож
    // subscribedPagesKey лишається "1" по обидва боки зміни params.
    // Наскрізна перевірка через `data.length` тут НЕ підходить: у
    // infinite-режимі виклик `setLoadedPages([initialPage])` у ефекті
    // зміни params сам по собі є новим масивом (інша ідентичність), і
    // це змушує React повторно виконати рендер-функцію навіть коли
    // підписка лишається прив'язаною до старого запису кешу — тобто
    // компонент випадково отримує свіжі дані попри зламану підписку
    // (те саме маскування, від якого застерігає ТЗ, тільки інший його
    // прояв). Тому перевіряємо підписку напряму через `_debugEntries()`.
    const get = makePagedGet();
    configureApiClient({ httpClient: makeHttpClient(get) });
    const api = apiPaginate<ListResponse, Item[], { q: string }>('/search-sub');

    let setQ: ((q: string) => void) | null = null;
    function Probe() {
      const [q, sq] = useState('a');
      setQ = sq;
      api.usePaginate({ q }, { initialLimit: 2, mode: 'infinite' });
      return null;
    }
    withProvider(createElement(Probe), client);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => {
      setQ!('b');
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));

    const entries = [...client.cache._debugEntries().values()];
    const oldEntry = entries.find(e => JSON.stringify(e.key).includes('"a"'));
    const newEntry = entries.find(e => JSON.stringify(e.key).includes('"b"'));

    expect(newEntry).toBeDefined();
    // Підписка мала перев'язатись на новий запис (під новими params) і
    // відв'язатись від старого — інакше notify() на новому записі не
    // матиме жодного підписника, і компонент не отримає ререндер.
    expect(newEntry?.subscribers.size).toBe(1);
    expect(oldEntry?.subscribers.size).toBe(0);
  });

  it('getItemKey дедуплицирует одинаковые элементы между страницами', async () => {
    // Бэк отдаёт page 1: [{id:1},{id:2}], page 2: [{id:2},{id:3}] — id:2 повтор.
    const get = vi.fn().mockImplementation((_u, cfg: { params: { page: number } }) => {
      if (cfg.params.page === 1)
        return Promise.resolve({ data: [{ id: 1 }, { id: 2 }], total: 6 });
      return Promise.resolve({ data: [{ id: 2 }, { id: 3 }], total: 6 });
    });
    configureApiClient({ httpClient: makeHttpClient(get) });
    const api = apiPaginate<ListResponse, Item[]>('/dup');

    let snap: UsePaginateResult<Item[]> | null = null;
    function Probe() {
      snap = api.usePaginate(undefined, {
        initialLimit: 2,
        mode: 'infinite',
        getItemKey: i => i.id,
      });
      return null;
    }
    withProvider(createElement(Probe), client);

    await waitFor(() => expect(snap?.data.length).toBe(2));
    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.data.length).toBe(3));
    expect(snap?.data.map(i => i.id)).toEqual([1, 2, 3]);
  });

  it('refetch() пересобирает все загруженные страницы', async () => {
    let bumped = 0;
    const get = vi
      .fn()
      .mockImplementation((_u, cfg: { params: { page: number } }) =>
        Promise.resolve({
          data: [{ id: cfg.params.page * 100 + bumped }],
          total: 6,
        } as ListResponse),
      );
    configureApiClient({ httpClient: makeHttpClient(get) });
    const api = apiPaginate<ListResponse, Item[]>('/refresh');

    let snap: UsePaginateResult<Item[]> | null = null;
    function Probe() {
      snap = api.usePaginate(undefined, { initialLimit: 1, mode: 'infinite' });
      return null;
    }
    withProvider(createElement(Probe), client);

    await waitFor(() => expect(snap?.data.length).toBe(1));
    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.data.length).toBe(2));
    expect(snap?.data.map(i => i.id)).toEqual([100, 200]);

    bumped = 7;
    await act(async () => {
      await snap!.refetch();
    });
    await waitFor(() => {
      expect(snap?.data.map(i => i.id)).toEqual([107, 207]);
    });
  });

  it('mutation invalidate префикса пагинации → авто-рефетч всех загруженных', async () => {
    let bumped = 0;
    const get = vi
      .fn()
      .mockImplementation((_u, cfg: { params: { page: number } }) =>
        Promise.resolve({
          data: [{ id: cfg.params.page * 100 + bumped }],
          total: 6,
        } as ListResponse),
      );
    const request = vi.fn().mockResolvedValue({ ok: true });
    configureApiClient({
      httpClient: { get, request } as IHttpClient,
    });
    const api = apiPaginate<ListResponse, Item[]>('/inv');
    const touch = apiMutation<{ ok: true }, void>('/touch', { method: 'POST' });

    let snap: UsePaginateResult<Item[]> | null = null;
    let mutateFn: (() => void) | null = null;
    function Screen() {
      snap = api.usePaginate(undefined, {
        initialLimit: 1,
        mode: 'infinite',
        staleTime: 60_000,
      });
      mutateFn = touch.useMutation({
        invalidateKeys: [['__paginate__', '/inv']],
      }).mutate;
      return null;
    }
    withProvider(createElement(Screen), client);

    await waitFor(() => expect(snap?.data.length).toBe(1));
    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.data.length).toBe(2));
    expect(snap?.data.map(i => i.id)).toEqual([100, 200]);

    bumped = 9;
    await act(async () => {
      mutateFn!();
    });
    await waitFor(() => {
      expect(snap?.data.map(i => i.id)).toEqual([109, 209]);
    });
  });

  it('fetchPreviousPage — no-op в infinite-режиме', async () => {
    const get = makePagedGet();
    configureApiClient({ httpClient: makeHttpClient(get) });
    const api = apiPaginate<ListResponse, Item[]>('/pp');

    let snap: UsePaginateResult<Item[]> | null = null;
    function Probe() {
      snap = api.usePaginate(undefined, { initialLimit: 2, mode: 'infinite' });
      return null;
    }
    withProvider(createElement(Probe), client);
    await waitFor(() => expect(snap?.data.length).toBe(2));
    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.data.length).toBe(4));

    await act(async () => {
      await snap!.fetchPreviousPage();
    });
    expect(snap?.data.length).toBe(4);
    expect(snap?.hasPreviousPage).toBe(false);
  });

  it('mode: page по умолчанию — поведение не изменилось', async () => {
    const get = makePagedGet();
    configureApiClient({ httpClient: makeHttpClient(get) });
    const api = apiPaginate<ListResponse, Item[]>('/page');

    let snap: UsePaginateResult<Item[]> | null = null;
    function Probe() {
      snap = api.usePaginate(undefined, { initialLimit: 2 });
      return null;
    }
    withProvider(createElement(Probe), client);

    await waitFor(() => expect(snap?.data.length).toBe(2));
    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.currentPage).toBe(2));
    // данные ЗАМЕНЯЮТСЯ, не накапливаются
    expect(snap?.data.length).toBe(2);
    expect(snap?.data.map(i => i.id)).toEqual([21, 22]);
  });

  it('reset() в infinite очищает аккумулятор', async () => {
    const get = makePagedGet();
    configureApiClient({ httpClient: makeHttpClient(get) });
    const api = apiPaginate<ListResponse, Item[]>('/reset');

    let snap: UsePaginateResult<Item[]> | null = null;
    function Probe() {
      snap = api.usePaginate(undefined, { initialLimit: 2, mode: 'infinite' });
      return null;
    }
    withProvider(createElement(Probe), client);
    await waitFor(() => expect(snap?.data.length).toBe(2));
    await act(async () => {
      await snap!.fetchNextPage();
    });
    await waitFor(() => expect(snap?.data.length).toBe(4));

    await act(async () => {
      snap!.reset();
    });
    await waitFor(() => expect(snap?.data.length).toBe(2));
    expect(snap?.currentPage).toBe(1);
  });
});