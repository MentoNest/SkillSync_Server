import { ResponseInterceptor } from './response.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<any>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  it('should format successful response', async () => {
    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue({ statusCode: 200 }),
        getRequest: jest.fn().mockReturnValue({
          url: '/api/test',
          headers: { 'x-request-id': 'req-123' },
        }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ foo: 'bar' })),
    } as CallHandler;

    const result = await firstValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler));

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.message).toBe('Success');
    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.path).toBe('/api/test');
    expect(result.requestId).toBe('req-123');
    expect(result.timestamp).toBeDefined();
  });

  it('should merge paginated response correctly', async () => {
    const mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue({ statusCode: 200 }),
        getRequest: jest.fn().mockReturnValue({
          url: '/api/test',
          headers: {},
        }),
      }),
    } as unknown as ExecutionContext;

    const paginatedData = {
      data: [{ id: 1 }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    };

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of(paginatedData)),
    } as CallHandler;

    const result = await firstValueFrom(interceptor.intercept(mockExecutionContext, mockCallHandler));

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual(paginatedData);
    expect(result.requestId).toBe('N/A');
  });
});
