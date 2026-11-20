import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IsInt, IsString, Min, validate, ValidateNested, ValidationError } from 'class-validator';
import { plainToInstance, Type } from 'class-transformer';
import {
  BusinessRuleException,
  DuplicateResourceException,
  InvalidCredentialsException,
  ResourceNotFoundException,
  TokenExpiredException,
  ValidationFailedException,
} from '../errors/app-exceptions';
import { codeForStatus, ErrorCode } from '../errors/error-codes';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { formatValidationErrors } from './validation';

function run(exception: unknown, production = false) {
  const filter = new AllExceptionsFilter(production);
  const json = jest.fn();
  const response = { locals: {} as Record<string, unknown>, status: jest.fn().mockReturnThis(), json };
  const request = { id: 'req-1', method: 'GET', url: '/x?y=1', originalUrl: '/x?y=1', headers: {} };
  const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) };
  filter.catch(exception, host as never);
  return { body: json.mock.calls[0][0], response };
}

describe('AllExceptionsFilter', () => {
  it('answers every error with the same shape', () => {
    const { body, response } = run(new NotFoundException('Mentor missing'));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(body).toEqual({
      statusCode: 404,
      message: 'Mentor missing',
      error: 'Not Found',
      code: 'NOT_FOUND',
      timestamp: expect.any(String),
      path: '/x?y=1',
      requestId: 'req-1',
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('maps known exception classes to status and error code', () => {
    expect(run(new UnauthorizedException()).body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(run(new ForbiddenException()).body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(run(new HttpException('slow down', 429)).body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED', error: 'Too Many Requests' });
  });

  it('uses the custom exceptions codes', () => {
    expect(run(new InvalidCredentialsException()).body).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    expect(run(new TokenExpiredException()).body).toMatchObject({ statusCode: 401, code: 'TOKEN_EXPIRED' });
    expect(run(new DuplicateResourceException('Email in use')).body).toMatchObject({ statusCode: 409, code: 'CONFLICT', message: 'Email in use' });
    expect(run(new ResourceNotFoundException('Session', 's1')).body.message).toBe('Session "s1" was not found');
    expect(run(new BusinessRuleException('Too late', ErrorCode.UNPROCESSABLE)).body).toMatchObject({ statusCode: 422 });
  });

  it('joins array messages from the built-in pipes', () => {
    const { body } = run(new BadRequestException(['a must be a string', 'b must be a number']));
    expect(body.message).toBe('a must be a string; b must be a number');
  });

  it('turns unknown errors into a generic 500 without leaking internals', () => {
    const { body, response } = run(new Error('password=hunter2 failed at db.ts:12'), true);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.stack).toBeUndefined();
  });

  it('includes a stack trace only outside production', () => {
    expect(run(new Error('boom'), false).body.stack).toContain('boom');
    expect(run(new Error('boom'), true).body.stack).toBeUndefined();
    expect(run('a thrown string', false).body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
  });

  it('leaves the handled error for the request logger', () => {
    const error = new Error('boom');
    expect(run(error).response.locals.error).toBe(error);
  });

  it('falls back to the request id header when the logger did not set one', () => {
    const filter = new AllExceptionsFilter(true);
    const body = filter.buildBody(new NotFoundException(), { url: '/z', headers: { 'x-request-id': 'abc' } } as never);
    expect(body.requestId).toBe('abc');
    expect(body.path).toBe('/z');
  });
});

describe('validation errors', () => {
  class Address {
    @IsString() city!: string;
  }
  class Dto {
    @IsString() name!: string;
    @IsInt() @Min(1) age!: number;
    @ValidateNested() @Type(() => Address) address!: Address;
  }

  async function errorsFor(payload: unknown): Promise<ValidationError[]> {
    return validate(plainToInstance(Dto, payload));
  }

  it('maps each field to a list of readable messages, including nested fields', async () => {
    const formatted = formatValidationErrors(await errorsFor({ name: 5, age: 0, address: { city: 1 } }));

    expect(formatted).toEqual(
      expect.arrayContaining([
        { field: 'name', errors: ['name must be a string'] },
        { field: 'age', errors: ['age must not be less than 1'] },
        { field: 'address.city', errors: ['city must be a string'] },
      ]),
    );
  });

  it('is returned as { field, errors } by the filter', async () => {
    const exception = new ValidationFailedException(formatValidationErrors(await errorsFor({ name: 5, age: 3, address: { city: 'x' } })));
    const { body } = run(exception);

    expect(body).toMatchObject({ statusCode: 400, message: 'Validation failed', code: 'VALIDATION_FAILED' });
    expect(body.errors).toEqual([{ field: 'name', errors: ['name must be a string'] }]);
  });
});

describe('codeForStatus', () => {
  it('maps statuses and falls back by class', () => {
    expect(codeForStatus(404)).toBe(ErrorCode.NOT_FOUND);
    expect(codeForStatus(418)).toBe(ErrorCode.BAD_REQUEST);
    expect(codeForStatus(502)).toBe(ErrorCode.INTERNAL_ERROR);
  });
});
