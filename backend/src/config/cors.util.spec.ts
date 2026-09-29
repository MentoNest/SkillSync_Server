import {
  createCorsOriginGuard,
  createCorsOptions,
  isCorsOriginAllowed,
  parseCorsOrigins,
} from './cors.util.js';

describe('CORS origin policy', () => {
  it('parses comma-separated origins and normalizes trailing slashes', () => {
    expect(parseCorsOrigins(' https://app.example.com/, https://staging.example.com ')).toEqual(
      new Set(['https://app.example.com', 'https://staging.example.com']),
    );
  });

  it('rejects origin entries that contain paths or unsupported protocols', () => {
    expect(() => parseCorsOrigins('https://app.example.com/api')).toThrow(
      'Invalid CORS origin',
    );
    expect(() => parseCorsOrigins('file://app.example.com')).toThrow(
      'Invalid CORS origin',
    );
  });

  it('allows configured origins and denies unlisted production origins', () => {
    const allowed = parseCorsOrigins('https://app.example.com');
    expect(isCorsOriginAllowed('https://app.example.com', allowed, 'production')).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example.com', allowed, 'production')).toBe(false);
    expect(isCorsOriginAllowed(undefined, allowed, 'production')).toBe(true);
  });

  it('allows localhost origins only in development', () => {
    const allowed = new Set<string>();
    expect(isCorsOriginAllowed('http://localhost:5173', allowed, 'development')).toBe(true);
    expect(isCorsOriginAllowed('http://127.0.0.1:3000', allowed, 'development')).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:5173', allowed, 'production')).toBe(false);
  });

  it('rejects unlisted origins with a JSON 403 response', () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();
    const guard = createCorsOriginGuard(new Set(['https://app.example.com']), 'production');

    guard(
      { headers: { origin: 'https://evil.example.com' } },
      response,
      next,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Origin is not allowed by CORS',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('lets allowed origins continue to the CORS middleware', () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();
    const guard = createCorsOriginGuard(new Set(['https://app.example.com']), 'production');

    guard({ headers: { origin: 'https://app.example.com' } }, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it('configures methods, headers, credentials, and 204 preflight responses', () => {
    const options = createCorsOptions(new Set(['https://app.example.com']), 'production');
    expect(options.methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
    expect(options.allowedHeaders).toEqual(['Authorization', 'Content-Type', 'Accept']);
    expect(options.credentials).toBe(true);
    expect(options.optionsSuccessStatus).toBe(204);
  });
});