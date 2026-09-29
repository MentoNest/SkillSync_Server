import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MetricsBasicAuthGuard } from './metrics-basic-auth.guard.js';

describe('MetricsBasicAuthGuard', () => {
  const originalUsername = process.env.METRICS_BASIC_AUTH_USERNAME;
  const originalPassword = process.env.METRICS_BASIC_AUTH_PASSWORD;
  let guard: MetricsBasicAuthGuard;
  let setHeader: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.METRICS_BASIC_AUTH_USERNAME = 'prometheus';
    process.env.METRICS_BASIC_AUTH_PASSWORD = 'scrape-secret';
    guard = new MetricsBasicAuthGuard();
    setHeader = vi.fn();
  });

  afterEach(() => {
    if (originalUsername === undefined)
      delete process.env.METRICS_BASIC_AUTH_USERNAME;
    else process.env.METRICS_BASIC_AUTH_USERNAME = originalUsername;
    if (originalPassword === undefined)
      delete process.env.METRICS_BASIC_AUTH_PASSWORD;
    else process.env.METRICS_BASIC_AUTH_PASSWORD = originalPassword;
  });

  function context(authorization?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
        getResponse: () => ({ setHeader }),
      }),
    } as ExecutionContext;
  }

  it('allows configured Basic credentials', () => {
    const credentials = Buffer.from('prometheus:scrape-secret').toString(
      'base64',
    );
    expect(guard.canActivate(context(`Basic ${credentials}`))).toBe(true);
  });

  it('rejects incorrect credentials and requests Basic authentication', () => {
    expect(() => guard.canActivate(context('Basic dXNlcjpwYXNz'))).toThrow(
      UnauthorizedException,
    );
    expect(setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="metrics", charset="UTF-8"',
    );
  });

  it('fails closed when credentials are not configured', () => {
    delete process.env.METRICS_BASIC_AUTH_USERNAME;
    delete process.env.METRICS_BASIC_AUTH_PASSWORD;
    expect(() => guard.canActivate(context())).toThrow(
      ServiceUnavailableException,
    );
  });
});
