import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor.js';

describe('TransformInterceptor', () => {
  it('wraps a successful response with request and pagination context', async () => {
    const paginatedData = {
      data: [{ id: 'item-1' }],
      meta: {
        page: 2,
        limit: 10,
        total: 11,
        totalPages: 2,
        hasNext: false,
        hasPrev: true,
      },
      links: {
        first: '/items?page=1&limit=10',
        prev: '/items?page=1&limit=10',
        next: null,
        last: '/items?page=2&limit=10',
      },
    };
    const request = {
      originalUrl: '/api/v1/items?page=2&limit=10',
      url: '/items?page=2&limit=10',
      requestId: 'request-123',
      headers: {},
    };
    const response = { statusCode: 206 };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const handler = { handle: () => of(paginatedData) } as CallHandler;

    const result = await lastValueFrom(
      new TransformInterceptor().intercept(context, handler),
    );

    expect(result).toMatchObject({
      success: true,
      statusCode: 206,
      message: 'Success',
      data: paginatedData,
      path: '/api/v1/items?page=2&limit=10',
      requestId: 'request-123',
    });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('uses the request ID header when middleware did not attach one', async () => {
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          url: '/items',
          headers: { 'x-request-id': 'header-id' },
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
    const handler = { handle: () => of({ value: 1 }) } as CallHandler;

    const result = await lastValueFrom(
      new TransformInterceptor().intercept(context, handler),
    );

    expect(result.requestId).toBe('header-id');
    expect(result.path).toBe('/items');
  });

  it('leaves non-HTTP responses unchanged', async () => {
    const context = {
      getType: () => 'ws',
    } as unknown as ExecutionContext;
    const data = { event: 'message' };
    const handler = { handle: () => of(data) } as CallHandler;

    const result = await lastValueFrom(
      new TransformInterceptor().intercept(context, handler),
    );

    expect(result).toBe(data);
  });
});
