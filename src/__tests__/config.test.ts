import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient, getConfig, isConfigured } from '../config';
import type { IHttpClient } from '../types';

const makeHttpClient = (): IHttpClient => ({
  get: vi.fn(),
  request: vi.fn(),
});

describe('configureApiClient / getConfig / isConfigured', () => {
  beforeEach(() => {
    // сброс глобального стейта между тестами
    // configureApiClient просто перетирает singleton — этого достаточно
    configureApiClient({ httpClient: makeHttpClient() });
  });

  it('isConfigured возвращает true после configureApiClient', () => {
    expect(isConfigured()).toBe(true);
  });

  it('getConfig отдаёт переданный httpClient', () => {
    const httpClient = makeHttpClient();
    const onUnauthorized = vi.fn();
    configureApiClient({ httpClient, onUnauthorized });

    const cfg = getConfig();
    expect(cfg.httpClient).toBe(httpClient);
    expect(cfg.onUnauthorized).toBe(onUnauthorized);
  });
});