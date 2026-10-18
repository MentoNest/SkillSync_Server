import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CallHandler } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { of, lastValueFrom } from 'rxjs';
import { RawResponse } from './raw-response.decorator';
import { TransformInterceptor } from './transform.interceptor';

function createContext(options: { statusCode?: number; url?: string; requestId?: string } = {}) {
  const request: Record<string, unknown> = {
    originalUrl: options.url ?? '/users?page=2',
    url: options.url ?? '/users?page=2',
    requestId: options.requestId,
  };
  const response = { statusCode: options.statusCode ?? 200 } as Response;
  return {
    request,
    response,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
      getHandler: () => handlerRef,
      getClass: () => class Ref {},
    } as unknown as ExecutionContext,
  };
}

let handlerRef: () => void;

async function run(payload: unknown, ctx: ExecutionContext): Promise<Record<string, unknown>> {
  const moduleRef = await Test.createTestingModule({
    providers: [TransformInterceptor, Reflector],
  }).compile();

  const interceptor = moduleRef.get(TransformInterceptor);
  const next: CallHandler = { handle: () => of(payload) };
  const result = await lastValueFrom(interceptor.intercept(ctx, next));
  return result as Record<string, unknown>;
}

describe('TransformInterceptor', () => {
  beforeEach(() => {
    handlerRef = function handler() {};
  });

  it('wraps a payload in the standard success envelope', async () => {
    const { ctx } = createContext();
    const result = await run({ id: 'u1' }, ctx);

    expect(result).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'OK',
      data: { id: 'u1' },
      path: '/users?page=2',
    });
    expect(typeof result.timestamp).toBe('string');
    expect(new Date(result.timestamp as string).toISOString()).toBe(result.timestamp);
  });

  it('uses a status-appropriate message for 201', async () => {
    const { ctx } = createContext({ statusCode: 201 });
    const result = await run({ id: 'u1' }, ctx);
    expect(result).toMatchObject({ success: true, statusCode: 201, message: 'Created' });
  });

  it('preserves the pagination shape inside the data field', async () => {
    const { ctx } = createContext();
    const paginated = {
      data: [{ id: 1 }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    };
    const result = await run(paginated, ctx);

    expect(result.data).toEqual(paginated);
    expect((result.data as typeof paginated).meta.page).toBe(1);
  });

  it('includes requestId when the middleware set one', async () => {
    const { ctx } = createContext({ requestId: 'req-123' });
    const result = await run({ id: 'u1' }, ctx);
    expect(result.requestId).toBe('req-123');
  });

  it('omits requestId when the request never had one', async () => {
    const { ctx } = createContext();
    const result = await run({ id: 'u1' }, ctx);
    expect(result).not.toHaveProperty('requestId');
  });

  it('normalises a null/undefined body to null instead of dropping the envelope', async () => {
    const { ctx } = createContext();
    const result = await run(undefined, ctx);
    expect(result).toMatchObject({ success: true, data: null });
  });

  it('leaves a 204 body untouched', async () => {
    const { ctx } = createContext({ statusCode: 204 });
    const result = await run(undefined, ctx);
    expect(result).toBeUndefined();
  });

  it('passes the payload through unchanged for @RawResponse routes', async () => {
    RawResponse()(class Ref {});
    handlerRef = function rawHandler() {};
    RawResponse()(handlerRef as never);

    const { ctx } = createContext();
    const result = await run({ plain: true }, ctx);

    expect(result).toEqual({ plain: true });
  });
});