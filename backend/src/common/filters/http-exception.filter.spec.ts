import {
  ArgumentsHost,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

function createHost() {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const request = { method: 'GET', url: '/api/v1/things' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host };
}

describe('HttpExceptionFilter', () => {
  const originalEnv = process.env;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    errorSpy = jest
      .spyOn(require('@nestjs/common').Logger.prototype, 'error')
      .mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('includes server error stack traces in development logs', () => {
    process.env.NODE_ENV = 'development';
    const exception = new InternalServerErrorException('failed');
    const { host } = createHost();

    new HttpExceptionFilter().catch(exception, host);

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), exception.stack);
  });

  it('omits server error stack traces from production logs', () => {
    process.env.NODE_ENV = 'production';
    const { host } = createHost();

    new HttpExceptionFilter().catch(
      new InternalServerErrorException('failed'),
      host,
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), undefined);
  });
});