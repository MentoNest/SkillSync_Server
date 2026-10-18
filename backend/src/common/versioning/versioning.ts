import { INestApplication, VersioningType } from '@nestjs/common';

/** URL prefix and the version served when a client omits one (issue #1479). */
export const API_PREFIX = 'api';
export const CURRENT_API_VERSION = '1';
export const SUPPORTED_API_VERSIONS: readonly string[] = ['1'];

/**
 * Versions that still work but are scheduled for removal. Clients calling them
 * get `Deprecation: true` and a `Sunset` date. Example:
 *   { '1': new Date('2027-06-30') }   // once /v2 exists
 */
export const DEPRECATED_API_VERSIONS: Readonly<Record<string, Date>> = {};

/** Probes and metrics stay outside /api so orchestrators keep working. */
export const UNVERSIONED_ROUTES = ['health', 'metrics'];

export function isSupportedVersion(version: string): boolean {
  return SUPPORTED_API_VERSIONS.includes(version);
}

/** Extracts "1" from "/api/v1/users", or null when the path has no version. */
export function versionFromPath(path: string): string | null {
  const match = new RegExp(`^/${API_PREFIX}/v(\\d+)(/|$)`).exec(path);
  return match ? match[1] : null;
}

/**
 * URI versioning: every route is served at /api/v1/... Routes without an
 * explicit @Version() get the default version; a request for a version that
 * does not exist (/api/v9/...) is a 404.
 */
export function configureApiVersioning(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX, { exclude: UNVERSIONED_ROUTES });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: CURRENT_API_VERSION,
  });
}
