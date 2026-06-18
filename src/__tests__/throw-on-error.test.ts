import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../config';
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

describe('throwOnError: false (default, backward-compat)', () => {
  beforeEach(() => {
    configureApiClient({ httpClient: makeHttpClient() });
  });

  it('сетевая ошибка возвращается как { status: false }', async () => {
    const get = vi.fn().mockRejectedValue(new Error('Network down'));
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    const result = await executeRequest('/x', {});
    expect(result).toEqual({ status: false, message: 'Network down' });
  });

  it('HTTP 4xx с телом возвращается как { ...data, status: false }', async () => {
    const get = vi.fn().mockRejectedValue({
      response: { status: 422, data: { errors: { name: ['req'] } } },
    });
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    const result = await executeRequest('/x', {});
    expect(result).toEqual({
      errors: { name: ['req'] },
      status: false,
    });
  });

  it('200 с { status: false } не кидается, как было', async () => {
    const get = vi.fn().mockResolvedValue({ status: false, message: 'biz' });
    configureApiClient({ httpClient: makeHttpClient({ get }) });

    const result = await executeRequest('/x', {});
    // executeRequest исторически выставляет status: true поверх response —
    // мы не ломаем это поведение в режиме backward-compat
    expect(result.status).toBe(true);
  });
});

describe('throwOnError: true', () => {
  it('сетевая ошибка → ApiError isNetworkError', async () => {
    const get = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      throwOnError: true,
    });

    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      isNetworkError: true,
      status: 0,
      message: 'ENOTFOUND',
    });
  });

  it('HTTP 4xx → ApiError с status и errors', async () => {
    const get = vi.fn().mockRejectedValue({
      response: {
        status: 422,
        data: { message: 'invalid', errors: { name: ['req'] } },
      },
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      throwOnError: true,
    });

    try {
      await executeRequest('/x', {});
      throw new Error('должен был кинуть');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(422);
      expect(err.isValidationError).toBe(true);
      expect(err.message).toBe('invalid');
    }
  });

  it('HTTP 401 → ApiError isUnauthorized и onUnauthorized вызывается', async () => {
    const onUnauthorized = vi.fn();
    const get = vi.fn().mockRejectedValue({
      response: { status: 401, data: { message: 'unauth' } },
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      onUnauthorized,
      throwOnError: true,
    });

    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      isUnauthorized: true,
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('HTTP 5xx → ApiError', async () => {
    const get = vi.fn().mockRejectedValue({
      response: { status: 500, data: { message: 'server down' } },
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      throwOnError: true,
    });

    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'server down',
    });
  });

  it('200 с { status: false } → ApiError (бизнес-ошибка)', async () => {
    const get = vi.fn().mockResolvedValue({
      status: false,
      message: 'PAYMENT_LOCKED',
      errors: { code: 'lock' },
    });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      throwOnError: true,
    });

    await expect(executeRequest('/x', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      message: 'PAYMENT_LOCKED',
    });
  });

  it('200 с { status: true } → resolve как обычно', async () => {
    const get = vi.fn().mockResolvedValue({ id: 1, name: 'ok' });
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      throwOnError: true,
    });

    const result = await executeRequest('/x', {});
    expect(result).toEqual({ id: 1, name: 'ok', status: true });
  });

  it('ApiError имеет рабочий instanceof', async () => {
    const get = vi.fn().mockRejectedValue(new Error('x'));
    configureApiClient({
      httpClient: makeHttpClient({ get }),
      throwOnError: true,
    });

    try {
      await executeRequest('/x', {});
    } catch (e) {
      expect(e instanceof ApiError).toBe(true);
      expect(e instanceof Error).toBe(true);
    }
  });
});
