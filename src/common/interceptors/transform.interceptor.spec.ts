import { TransformInterceptor } from './transform.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';

function makeContext(overrides: Record<string, unknown> = {}): ExecutionContext {
  const req = { url: '/test', headers: {}, ...overrides };
  const res = { statusCode: 200, setHeader: jest.fn() };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('wraps data in success envelope', async () => {
    const ctx = makeContext();
    const handler: CallHandler = { handle: () => of({ id: 1 }) };

    const result = await firstValueFrom(interceptor.intercept(ctx, handler));

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({ id: 1 });
    expect(result.message).toBe('OK');
    expect(result.path).toBe('/test');
    expect(result.requestId).toBeTruthy();
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uses x-request-id header if present', async () => {
    const ctx = makeContext({ headers: { 'x-request-id': 'trace-abc' } });
    const handler: CallHandler = { handle: () => of({}) };

    const result = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result.requestId).toBe('trace-abc');
  });

  it('generates unique requestId when header absent', async () => {
    const ctx1 = makeContext();
    const ctx2 = makeContext();
    const handler: CallHandler = { handle: () => of({}) };

    const r1 = await firstValueFrom(interceptor.intercept(ctx1, handler));
    const r2 = await firstValueFrom(interceptor.intercept(ctx2, handler));
    expect(r1.requestId).not.toBe(r2.requestId);
  });
});
