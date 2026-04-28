import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ApiResponseInterceptor } from './api-response.interceptor';

describe('ApiResponseInterceptor', () => {
  let interceptor: ApiResponseInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new ApiResponseInterceptor();
  });

  const createHttpContext = (options: {
    method: string;
    url: string;
    statusCode: number;
    requestId?: string;
  }): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: options.method,
          url: options.url,
          originalUrl: options.url,
          headers: options.requestId
            ? { 'x-request-id': options.requestId }
            : {},
        }),
        getResponse: () => ({
          statusCode: options.statusCode,
        }),
      }),
    }) as ExecutionContext;

  const createHandler = (body: unknown): CallHandler => ({
    handle: () => of(body),
  });

  it('wraps successful controller responses in the standard envelope', async () => {
    const response = await lastValueFrom(
      interceptor.intercept(
        createHttpContext({
          method: 'GET',
          url: '/users/me',
          statusCode: 200,
          requestId: 'req-plain',
        }),
        createHandler({ ok: true }),
      ),
    );

    expect(response).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'Request successful',
      data: { ok: true },
      path: '/users/me',
      requestId: 'req-plain',
    });
    expect(typeof response.timestamp).toBe('string');
  });

  it('keeps pagination metadata inside the data field for list controller responses', async () => {
    const response = await lastValueFrom(
      interceptor.intercept(
        createHttpContext({
          method: 'GET',
          url: '/users',
          statusCode: 200,
          requestId: 'req-list',
        }),
        createHandler({
          data: [{ id: 1 }],
          meta: {
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        }),
      ),
    );

    expect(response).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'Request successful',
      data: {
        data: [{ id: 1 }],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      requestId: 'req-list',
    });
  });

  it('uses controller-provided messages when available', async () => {
    const response = await lastValueFrom(
      interceptor.intercept(
        createHttpContext({
          method: 'POST',
          url: '/users',
          statusCode: 201,
          requestId: 'req-create',
        }),
        createHandler({
          message: 'User created successfully',
          data: { id: 'user-1' },
        }),
      ),
    );

    expect(response).toMatchObject({
      success: true,
      statusCode: 201,
      message: 'User created successfully',
      data: { id: 'user-1' },
      requestId: 'req-create',
    });
  });

  it('normalizes message-only controller responses to null data', async () => {
    const response = await lastValueFrom(
      interceptor.intercept(
        createHttpContext({
          method: 'POST',
          url: '/auth/logout',
          statusCode: 201,
          requestId: 'req-logout',
        }),
        createHandler({
          message: 'Logout successful',
        }),
      ),
    );

    expect(response).toMatchObject({
      success: true,
      statusCode: 201,
      message: 'Logout successful',
      data: null,
      requestId: 'req-logout',
    });
  });
});
