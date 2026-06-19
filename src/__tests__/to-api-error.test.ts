import { describe, expect, it } from 'vitest';

import { ApiError, businessErrorToApiError, toApiError } from '../errors';

describe('toApiError', () => {
  it('ApiError → passthrough (тот же инстанс)', () => {
    const original = new ApiError({ message: 'x', status: 500 });
    expect(toApiError(original)).toBe(original);
  });

  it('axios-style { response: { status, data } } → заполняет поля', () => {
    const err = toApiError({
      response: {
        status: 422,
        data: { message: 'invalid', code: 'VAL', errors: { name: ['req'] } },
      },
    });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VAL');
    expect(err.message).toBe('invalid');
    expect(err.isValidationError).toBe(true);
    expect(err.errors).toEqual({ name: ['req'] });
  });

  it('axios-style без data.message → дефолт HTTP <status>', () => {
    const err = toApiError({ response: { status: 500, data: {} } });
    expect(err.message).toBe('HTTP 500');
    expect(err.status).toBe(500);
  });

  it('axios-style 401 → isUnauthorized', () => {
    const err = toApiError({ response: { status: 401, data: {} } });
    expect(err.isUnauthorized).toBe(true);
  });

  it('Error → isNetworkError, status: 0', () => {
    const err = toApiError(new Error('ENOTFOUND'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isNetworkError).toBe(true);
    expect(err.status).toBe(0);
    expect(err.message).toBe('ENOTFOUND');
  });

  it('неизвестный объект → Unknown error', () => {
    const err = toApiError({ weird: true });
    expect(err.message).toBe('Unknown error');
    expect(err.status).toBe(0);
    expect(err.raw).toEqual({ weird: true });
  });

  it('null → Unknown error', () => {
    const err = toApiError(null);
    expect(err.message).toBe('Unknown error');
  });
});

describe('businessErrorToApiError', () => {
  it('Laravel-style { status: false, message, errors } → ApiError(200)', () => {
    const err = businessErrorToApiError({
      status: false,
      message: 'PAYMENT_LOCKED',
      errors: { code: 'lock' },
    });
    expect(err.status).toBe(200);
    expect(err.message).toBe('PAYMENT_LOCKED');
    expect(err.isValidationError).toBe(true);
    expect(err.errors).toEqual({ code: 'lock' });
  });

  it('пустое тело → default message', () => {
    const err = businessErrorToApiError({});
    expect(err.message).toBe('Request failed');
    expect(err.status).toBe(200);
  });
});