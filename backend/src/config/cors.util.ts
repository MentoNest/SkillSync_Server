type OriginCallback = (error: Error | null, allow?: boolean) => void;
type CorsRequest = { headers: { origin?: string } };
type CorsResponse = {
  status: (code: number) => CorsResponse;
  json: (body: Record<string, string | number>) => unknown;
};

const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const CORS_HEADERS = ['Authorization', 'Content-Type', 'Accept'];
const LOCALHOST_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

export function parseCorsOrigins(configuredOrigins?: string): Set<string> {
  const origins = new Set<string>();

  for (const entry of (configuredOrigins ?? '').split(',')) {
    const value = entry.trim();
    if (!value) continue;

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Invalid CORS origin: ${value}`);
    }

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      throw new Error(`Invalid CORS origin: ${value}`);
    }

    origins.add(parsed.origin);
  }

  return origins;
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
  environment: string,
): boolean {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  return environment === 'development' && LOCALHOST_ORIGIN.test(origin);
}

export function createCorsOriginGuard(
  allowedOrigins: ReadonlySet<string>,
  environment: string,
) {
  return (
    request: CorsRequest,
    response: CorsResponse,
    next: () => unknown,
  ) => {
    if (isCorsOriginAllowed(request.headers.origin, allowedOrigins, environment)) {
      return next();
    }

    return response.status(403).json({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Origin is not allowed by CORS',
    });
  };
}

export function createCorsOptions(
  allowedOrigins: ReadonlySet<string>,
  environment: string,
) {
  return {
    origin: (origin: string | undefined, callback: OriginCallback) => {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins, environment));
    },
    methods: CORS_METHODS,
    allowedHeaders: CORS_HEADERS,
    credentials: true,
    optionsSuccessStatus: 204,
  };
}