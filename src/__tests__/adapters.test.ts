import { describe, expect, it, vi } from 'vitest';

import {
  configureApiClient,
  graphqlAdapter,
  jsonApiAdapter,
  laravelAdapter,
  plainAdapter,
  problemJsonAdapter,
} from '../index';
import { ApiError } from '../errors';
import type { IHttpClient } from '../types';
import { executeRequest } from '../utils';

const makeHttpClient = (
  overrides: Partial<IHttpClient> = {},
): IHttpClient => ({
  get: vi.fn(),
  request: vi.fn(),
  ...overrides,
});

describe('Без responseAdapter — back-compat (Laravel-default)', () => {
  it('успех: { ...response, status: true }', async () => {
    const get = vi.fn().mockResolvedValue({ id: 1 });
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    const result = await executeRequest('/x', {});
    expect(result).toEqual({ id: 1, status: true });
  });

  it('ошибка: { ...data, status: false } (без throwOnError)', async () => {
    const get = vi
      .fn()
      .mockRejectedValue({ response: { status: 422, data: { message: 'm' } } });
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    const result = await executeRequest('/x', {});
    expect(result).toEqual({ message: 'm', status: false });
  });
});

describe('plainAdapter', () => {
  it('успех: identity (без status: true)', async () => {
    const get = vi.fn().mockResolvedValue({ id: 1, name: 'a' });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: plainAdapter,
    });

    const result = await executeRequest('/x', {});
    expect(result).toEqual({ id: 1, name: 'a' });
  });

  it('HTTP 4xx → ApiError', async () => {
    const get = vi
      .fn()
      .mockRejectedValue({ response: { status: 404, data: { message: 'nf' } } });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: plainAdapter,
    });

    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'nf',
    });
  });

  it('2xx с { status: false } не считается ошибкой (это не Laravel)', async () => {
    const get = vi.fn().mockResolvedValue({ status: false });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: plainAdapter,
    });

    const result = await executeRequest('/x', {});
    expect(result).toEqual({ status: false });
  });
});

describe('laravelAdapter', () => {
  it('успех: identity', async () => {
    const get = vi.fn().mockResolvedValue({ status: true, message: 'ok', user: { id: 1 } });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: laravelAdapter,
    });
    const result = await executeRequest('/x', {});
    expect(result).toMatchObject({ status: true, user: { id: 1 } });
  });

  it('{ status: false } → ApiError', async () => {
    const get = vi.fn().mockResolvedValue({
      status: false,
      message: 'PAYMENT_LOCKED',
      errors: { code: 'lock' },
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: laravelAdapter,
    });
    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      message: 'PAYMENT_LOCKED',
    });
  });
});

describe('jsonApiAdapter', () => {
  it('успех: unwrap → r.data', async () => {
    const get = vi.fn().mockResolvedValue({ data: { id: 1, type: 'order' } });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: jsonApiAdapter,
    });
    const result = await executeRequest('/x', {});
    expect(result).toEqual({ id: 1, type: 'order' });
  });

  it('errors[] → ApiError с detail', async () => {
    const get = vi.fn().mockResolvedValue({
      errors: [{ status: '422', title: 'Bad', detail: 'name required', code: 'VAL' }],
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: jsonApiAdapter,
    });
    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      message: 'name required',
      code: 'VAL',
    });
  });
});

describe('graphqlAdapter', () => {
  it('успех: unwrap → r.data', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { viewer: { id: 1 } },
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: graphqlAdapter,
    });
    const result = await executeRequest('/x', {});
    expect(result).toEqual({ viewer: { id: 1 } });
  });

  it('errors[] → ApiError с message', async () => {
    const get = vi.fn().mockResolvedValue({
      data: null,
      errors: [{ message: 'Unauthorized', path: ['viewer'] }],
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: graphqlAdapter,
    });
    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Unauthorized',
    });
  });
});

describe('problemJsonAdapter', () => {
  it('200 ok → identity', async () => {
    const get = vi.fn().mockResolvedValue({ ok: 1 });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: problemJsonAdapter,
    });
    expect(await executeRequest('/x', {})).toEqual({ ok: 1 });
  });

  it('HTTP 404 с problem+json → ApiError', async () => {
    const get = vi.fn().mockRejectedValue({
      response: {
        status: 404,
        data: { type: 'about:blank', title: 'Not Found', detail: '...' },
      },
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      responseAdapter: problemJsonAdapter,
    });
    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Not Found',
      code: 'about:blank',
    });
  });
});

describe('adapter и onUnauthorized', () => {
  it('401 вызывает onUnauthorized и кидает ApiError', async () => {
    const onUnauthorized = vi.fn();
    const get = vi
      .fn()
      .mockRejectedValue({ response: { status: 401, data: {} } });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      onUnauthorized,
      responseAdapter: plainAdapter,
    });

    await expect(executeRequest('/x', {})).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});
