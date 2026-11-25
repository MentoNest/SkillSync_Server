import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

function run(payload: unknown, statusCode = 200, requestId?: string) {
  const request = {
    id: requestId,
    url: '/users',
    originalUrl: '/users?page=1',
    headers: { 'x-request-id': 'header-123' },
  };
  const response = { statusCode };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  const handler: CallHandler = { handle: () => of(payload) };
  return lastValueFrom(new ResponseInterceptor().intercept(context, handler));
}

describe('ResponseInterceptor (#1694)', () => {
  it('wraps successful payloads in the standard envelope', async () => {
    const body = (await run({ id: 'u1' })) as Record<string, unknown>;

    expect(body).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'OK',
      data: { id: 'u1' },
      path: '/users?page=1',
      requestId: 'header-123',
    });
    expect(Number.isNaN(Date.parse(String(body.timestamp)))).toBe(false);
  });

  it('uses the logger request id when present', async () => {
    expect(await run([], 200, 'req-xyz')).toMatchObject({
      requestId: 'req-xyz',
    });
  });

  it('moves pagination metadata inside data', async () => {
    const meta = {
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
    const body = (await run({ data: [{ id: 'u1' }], meta })) as Record<
      string,
      unknown
    >;

    expect(body.data).toEqual({ items: [{ id: 'u1' }], meta });
  });

  it('uses the HTTP status message for created responses', async () => {
    expect(await run({ id: 'u1' }, 201)).toMatchObject({
      statusCode: 201,
      message: 'Created',
    });
  });

  it('leaves 204 responses empty', async () => {
    expect(await run(undefined, 204)).toBeUndefined();
  });
});
