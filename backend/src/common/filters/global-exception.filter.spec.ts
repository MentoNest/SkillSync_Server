import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { ValidationException } from '../exceptions/validation.exception';
import {
  BusinessException,
  ResourceNotFoundException,
} from '../exceptions/business.exception';

function createHost(overrides: Partial<any> = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = {
    requestId: 'req-123',
    method: 'GET',
    originalUrl: '/api/v1/things',
    headers: {},
    ...overrides,
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, response, status, json, request };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  const originalEnv = process.env;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    process.env = { ...originalEnv };
    jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'error')
      .mockImplementation();
    jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'warn')
      .mockImplementation();
  });

  afterAll(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('formats a NotFoundException with the correct status and requestId', () => {
    const { host, status, json } = createHost();
    filter.catch(new NotFoundException('Thing not found'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Thing not found',
        requestId: 'req-123',
        path: '/api/v1/things',
      }),
    );
  });

  it('formats an UnauthorizedException', () => {
    const { host, status, json } = createHost();
    filter.catch(new UnauthorizedException(), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.UNAUTHORIZED }),
    );
  });

  it('hides internal error details in production for unknown errors', () => {
    process.env.NODE_ENV = 'production';
    const { host, json } = createHost();

    filter.catch(new Error('some internal db detail'), host);

    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Internal server error');
    expect(body.stack).toBeUndefined();
  });

  it('includes the message and stack trace for unknown errors outside production', () => {
    process.env.NODE_ENV = 'development';
    const { host, json } = createHost();
    const err = new Error('boom');

    filter.catch(err, host);

    const body = json.mock.calls[0][0];
    expect(body.message).toBe('boom');
    expect(body.stack).toBe(err.stack);
  });

  it('formats class-validator failures as { field, errors[] }', () => {
    const { host, json } = createHost();
    const validationError: any = {
      property: 'email',
      constraints: { isEmail: 'email must be a valid email address' },
    };

    filter.catch(new ValidationException([validationError]), host);

    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.errors).toEqual([
      { field: 'email', errors: ['email must be a valid email address'] },
    ]);
  });

  it('propagates custom BusinessException error codes', () => {
    const { host, json } = createHost();

    filter.catch(new ResourceNotFoundException('User', '42'), host);

    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(body.error).toBe('NOT_FOUND');
    expect(body.message).toContain('User with id "42"');
  });

  it('falls back to the x-request-id header when req.requestId is missing', () => {
    const { host, json } = createHost({
      requestId: undefined,
      headers: { 'x-request-id': 'header-id' },
    });

    filter.catch(new BadRequestException('bad'), host);

    expect(json.mock.calls[0][0].requestId).toBe('header-id');
  });

  it('always returns the full consistent response shape', () => {
    const { host, json } = createHost();

    filter.catch(new BusinessException('custom failure'), host);

    const body = json.mock.calls[0][0];
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining([
        'statusCode',
        'message',
        'error',
        'timestamp',
        'path',
        'requestId',
      ]),
    );
  });
});
