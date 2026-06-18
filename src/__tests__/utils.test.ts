import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../config';
import type { IHttpClient } from '../types';
import { buildEndpoint, executeRequest, handleResponse } from '../utils';

const makeHttpClient = (overrides: Partial<IHttpClient> = {}): IHttpClient => ({
  get: vi.fn(),
  request: vi.fn(),
  ...overrides,
});

describe('buildEndpoint', () => {
  it('возвращает строку как есть', () => {
    expect(buildEndpoint('/api/users')).toBe('/api/users');
  });

  it('вызывает функцию с params, если они переданы', () => {
    const fn = (p: { id: string }) => `/api/users/${p.id}`;
    expect(buildEndpoint(fn, { id: '42' })).toBe('/api/users/42');
  });

  it('возвращает endpoint-функцию без вызова, если params не переданы', () => {
    const fn = ((p: { id: string }) => `/api/users/${p.id}`) as unknown as string;
    expect(buildEndpoint(fn)).toBe(fn);
  });
});

describe('executeRequest', () => {
  it('GET-запрос: отдаёт ответ с status: true', async () => {
    const get = vi.fn().mockResolvedValue({ name: 'Alice' });
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    const result = await executeRequest<{ name: string }, void, unknown>(
      '/api/users/1',
      {},
    );

    expect(get).toHaveBeenCalledWith('/api/users/1', { params: {} });
    expect(result).toEqual({ name: 'Alice', status: true });
  });

  it('передаёт params и requestParams в httpClient.get', async () => {
    const get = vi.fn().mockResolvedValue({});
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    await executeRequest('/api/users', { requestParams: { sort: 'asc' } }, {
      page: '2',
    });

    expect(get).toHaveBeenCalledWith('/api/users', {
      params: { sort: 'asc', page: '2' },
    });
  });

  it('POST/PUT/PATCH/DELETE идут через httpClient.request с data', async () => {
    const request = vi.fn().mockResolvedValue({ id: 1 });
    configureApiClient({ httpClient: makeHttpClient({ request }) });

    const result = await executeRequest(
      '/api/users',
      { method: 'POST' },
      { name: 'Alice' },
    );

    expect(request).toHaveBeenCalledWith('/api/users', {
      method: 'POST',
      data: { name: 'Alice' },
    });
    expect(result).toEqual({ id: 1, status: true });
  });

  it('при ошибке c response.data возвращает { ...data, status: false }', async () => {
    const get = vi.fn().mockRejectedValue({
      response: { status: 422, data: { message: 'invalid', errors: { name: ['req'] } } },
    });
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    const result = await executeRequest('/api/users', {});
    expect(result).toEqual({
      message: 'invalid',
      errors: { name: ['req'] },
      status: false,
    });
  });

  it('при сетевой ошибке без response возвращает status: false с message', async () => {
    const get = vi.fn().mockRejectedValue(new Error('Network down'));
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    const result = await executeRequest('/api/users', {});
    expect(result).toEqual({ status: false, message: 'Network down' });
  });

  it('вызывает onUnauthorized при 401', async () => {
    const onUnauthorized = vi.fn();
    const get = vi.fn().mockRejectedValue({
      response: { status: 401, data: { message: 'unauth' } },
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      onUnauthorized,
    });

    await executeRequest('/api/users', {});
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});

describe('handleResponse', () => {
  beforeEach(() => {
    configureApiClient({ httpClient: makeHttpClient() });
  });

  it('вызывает onSuccess при status: true', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    handleResponse({ status: true, foo: 1 } as any, onSuccess, onError);
    expect(onSuccess).toHaveBeenCalledWith({ status: true, foo: 1 });
    expect(onError).not.toHaveBeenCalled();
  });

  it('вызывает onError с Error при status: false', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    handleResponse(
      { status: false, message: 'oops' } as any,
      onSuccess,
      onError,
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    const [err] = onError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('oops');
  });
});