import { of } from 'rxjs';
import { DeprecationInterceptor } from './deprecation.interceptor';
import {
  CURRENT_API_VERSION,
  configureApiVersioning,
  isSupportedVersion,
  versionFromPath,
} from './versioning';

describe('API versioning', () => {
  it('serves v1 as the current version', () => {
    expect(CURRENT_API_VERSION).toBe('1');
    expect(isSupportedVersion('1')).toBe(true);
    expect(isSupportedVersion('9')).toBe(false);
  });

  it('extracts the version from a request path', () => {
    expect(versionFromPath('/api/v1/users')).toBe('1');
    expect(versionFromPath('/api/v12')).toBe('12');
    expect(versionFromPath('/health')).toBeNull();
    expect(versionFromPath('/api/users')).toBeNull();
  });

  it('configures a global prefix and URI versioning', () => {
    const app: any = { setGlobalPrefix: jest.fn(), enableVersioning: jest.fn() };
    configureApiVersioning(app);
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api', { exclude: ['health', 'metrics'] });
    expect(app.enableVersioning).toHaveBeenCalledWith(
      expect.objectContaining({ defaultVersion: '1' }),
    );
  });
});

describe('DeprecationInterceptor', () => {
  const run = (url: string, deprecated: Record<string, Date>) => {
    const headers: Record<string, string> = {};
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: url }),
        getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
      }),
    };
    const next = { handle: jest.fn().mockReturnValue(of('ok')) };
    new DeprecationInterceptor(deprecated).intercept(context, next);
    return { headers, next };
  };

  it('adds Deprecation and Sunset headers for deprecated versions', () => {
    const { headers, next } = run('/api/v1/users', { '1': new Date('2027-06-30T00:00:00Z') });
    expect(headers.Deprecation).toBe('true');
    expect(headers.Sunset).toBe('Wed, 30 Jun 2027 00:00:00 GMT');
    expect(next.handle).toHaveBeenCalled();
  });

  it('leaves current versions untouched', () => {
    const { headers } = run('/api/v2/users', { '1': new Date('2027-06-30') });
    expect(headers).toEqual({});
  });
});
