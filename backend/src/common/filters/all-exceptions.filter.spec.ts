import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { ValidationError } from 'class-validator';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ErrorCode } from '../constants/error-codes';
import { AuthenticationException } from '../exceptions/authentication.exception';
import { ResourceNotFoundException } from '../exceptions/resource-not-found.exception';
import { ValidationException } from '../exceptions/validation.exception';

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
  locals: Record<string, unknown>;
}

function createHost(request: Partial<Request> = {}, requestId?: string) {
  const response: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    locals: {},
  };
  const req = {
    method: 'GET',
    url: '/users/me',
    originalUrl: '/users/me',
    headers: {},
    ...(requestId ? { requestId } : {}),
    ...request,
  } as unknown as Request;
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => req,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

function errorBody(response: MockResponse): Record<string, unknown> {
  return response.json.mock.calls[0][0] as Record<string, unknown>;
}

describe('AllExceptionsFilter', () => {
  const originalEnv = process.env;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('returns the consistent error schema for built-in HTTP exceptions', () => {
    const { host, response } = createHost({}, 'req-1');

    new AllExceptionsFilter().catch(new BadRequestException('Bad name'), host);

    const body = errorBody(response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Bad name');
    expect(body.error).toBe('Bad Request');
    expect(body.code).toBe(ErrorCode.BAD_REQUEST);
    expect(body.timestamp).toEqual(expect.any(String));
    expect(body.path).toBe('/users/me');
    expect(body.requestId).toBe('req-1');
    expect(body.stack).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('formats class-validator errors as field error details', () => {
    const validationErrors = [
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
        children: [],
      },
      {
        property: 'profile',
        children: [
          {
            property: 'age',
            constraints: { isInt: 'age must be an integer' },
            children: [],
          },
        ],
      },
    ] as unknown as ValidationError[];

    const { host, response } = createHost();
    new AllExceptionsFilter().catch(new ValidationException(validationErrors), host);

    const body = errorBody(response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(body.message).toBe('Validation failed');
    expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body.details).toEqual([
      { field: 'email', errors: ['email must be an email'] },
      { field: 'profile.age', errors: ['age must be an integer'] },
    ]);
  });

  it('uses custom exception codes for known exceptions', () => {
    const notFound = createHost();
    new AllExceptionsFilter().catch(new ResourceNotFoundException('User', 'u1'), notFound.host);
    const notFoundBody = errorBody(notFound.response);
    expect(notFound.response.status).toHaveBeenCalledWith(404);
    expect(notFoundBody.message).toBe("User 'u1' not found");
    expect(notFoundBody.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);

    const unauthorized = createHost();
    new AllExceptionsFilter().catch(new AuthenticationException('Missing bearer token'), unauthorized.host);
    expect(errorBody(unauthorized.response).code).toBe(ErrorCode.UNAUTHORIZED);
    expect(errorBody(unauthorized.response).statusCode).toBe(401);
  });

  it('keeps string-array messages from other pipes', () => {
    const { host, response } = createHost();
    new AllExceptionsFilter().catch(new BadRequestException(['first', 'second']), host);

    const body = errorBody(response);
    expect(body.message).toEqual(['first', 'second']);
    expect(body.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('hides internals for unknown errors in production', () => {
    process.env.NODE_ENV = 'production';
    const { host, response } = createHost();

    new AllExceptionsFilter().catch(new Error('database connection leaked'), host);

    const body = errorBody(response);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(body.message).toBe('Internal server error');
    expect(body.error).toBe('Internal Server Error');
    expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(body.stack).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it('exposes message and stack for unknown errors outside production', () => {
    process.env.NODE_ENV = 'development';
    const { host, response } = createHost();

    new AllExceptionsFilter().catch(new Error('kaboom'), host);

    const body = errorBody(response);
    expect(body.message).toBe('kaboom');
    expect(typeof body.stack).toBe('string');
    expect(response.locals.errorStack).toBe(body.stack);
  });

  it('masks 500-level HttpException messages in production but keeps them in development', () => {
    process.env.NODE_ENV = 'production';
    const prod = createHost();
    new AllExceptionsFilter().catch(new InternalServerErrorException('secret detail'), prod.host);
    expect(errorBody(prod.response).message).toBe('Internal server error');
    expect(errorBody(prod.response).stack).toBeUndefined();

    process.env.NODE_ENV = 'development';
    const dev = createHost();
    new AllExceptionsFilter().catch(new InternalServerErrorException('secret detail'), dev.host);
    expect(errorBody(dev.response).message).toBe('secret detail');
    expect(typeof errorBody(dev.response).stack).toBe('string');
  });

  it('falls back to the x-request-id header and then to a generated id', () => {
    const headerHost = createHost({ headers: { 'x-request-id': 'from-header' } } as Partial<Request>);
    new AllExceptionsFilter().catch(new NotFoundException('nope'), headerHost.host);
    expect(errorBody(headerHost.response).requestId).toBe('from-header');

    const generatedHost = createHost();
    new AllExceptionsFilter().catch(new NotFoundException('nope'), generatedHost.host);
    const requestId = errorBody(generatedHost.response).requestId as string;
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('handles non-Error values without crashing', () => {
    const { host, response } = createHost();
    new AllExceptionsFilter().catch('plain failure', host);

    const body = errorBody(response);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(body.message).toBe('plain failure');
    expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('maps status codes to stable error codes', () => {
    const forbidden = createHost();
    new AllExceptionsFilter().catch(new HttpException('no access', 403), forbidden.host);
    expect(errorBody(forbidden.response).code).toBe(ErrorCode.FORBIDDEN);

    const conflict = createHost();
    new AllExceptionsFilter().catch(new HttpException('taken', 409), conflict.host);
    expect(errorBody(conflict.response).code).toBe(ErrorCode.CONFLICT);

    const unknownStatus = createHost();
    new AllExceptionsFilter().catch(new HttpException('weird', 418), unknownStatus.host);
    expect(errorBody(unknownStatus.response).code).toBe(ErrorCode.ERROR);
    expect(errorBody(unknownStatus.response).error).toBe('Error');
  });

  it('marks every error response with success:false so clients can branch on it (#1462)', () => {
    for (const exception of [
      new BadRequestException('bad'),
      new NotFoundException('missing'),
      new InternalServerErrorException('boom'),
      'non-error value',
    ]) {
      const { host, response } = createHost();
      new AllExceptionsFilter().catch(exception, host);
      expect(errorBody(response).success).toBe(false);
    }
  });

  it('never leaks an internal message through the envelope in production', () => {
    process.env.NODE_ENV = 'production';
    const { host, response } = createHost();

    new AllExceptionsFilter().catch(new Error('postgres://user:hunter2@db'), host);

    expect(JSON.stringify(errorBody(response))).not.toContain('hunter2');
    expect(errorBody(response).message).toBe('Internal server error');
  });
});
