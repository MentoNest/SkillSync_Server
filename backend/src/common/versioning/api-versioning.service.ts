import { Injectable, Logger } from '@nestjs/common';

export interface ApiVersion {
  version: string;
  status: 'active' | 'deprecated' | 'sunset';
  releasedAt: Date;
  deprecatedAt?: Date;
  sunsetAt?: Date;
  changelog?: string;
}

export interface VersionConfig {
  currentVersion: string;
  supportedVersions: ApiVersion[];
  deprecationNoticePeriod: number; // days
  sunsetNoticePeriod: number; // days
}

@Injectable()
export class ApiVersioningService {
  private readonly logger = new Logger(ApiVersioningService.name);
  private readonly config: VersionConfig;

  constructor() {
    this.config = {
      currentVersion: process.env.API_CURRENT_VERSION || 'v1',
      supportedVersions: [
        {
          version: 'v1',
          status: 'active',
          releasedAt: new Date('2024-01-01'),
        },
      ],
      deprecationNoticePeriod: parseInt(process.env.API_DEPRECATION_DAYS || '90', 10),
      sunsetNoticePeriod: parseInt(process.env.API_SUNSET_DAYS || '180', 10),
    };
  }

  /**
   * Get current API version
   */
  getCurrentVersion(): string {
    return this.config.currentVersion;
  }

  /**
   * Get all supported versions
   */
  getSupportedVersions(): ApiVersion[] {
    return this.config.supportedVersions;
  }

  /**
   * Check if a version is supported
   */
  isVersionSupported(version: string): boolean {
    return this.config.supportedVersions.some(
      (v) => v.version === version && v.status !== 'sunset',
    );
  }

  /**
   * Check if a version is deprecated
   */
  isVersionDeprecated(version: string): boolean {
    const apiVersion = this.config.supportedVersions.find(
      (v) => v.version === version,
    );
    return apiVersion?.status === 'deprecated';
  }

  /**
   * Get deprecation info for a version
   */
  getDeprecationInfo(version: string): {
    deprecated: boolean;
    deprecatedAt?: Date;
    sunsetAt?: Date;
    daysUntilSunset?: number;
    message?: string;
  } {
    const apiVersion = this.config.supportedVersions.find(
      (v) => v.version === version,
    );

    if (!apiVersion || apiVersion.status === 'active') {
      return { deprecated: false };
    }

    const now = new Date();
    const daysUntilSunset = apiVersion.sunsetAt
      ? Math.ceil((apiVersion.sunsetAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    return {
      deprecated: apiVersion.status === 'deprecated',
      deprecatedAt: apiVersion.deprecatedAt,
      sunsetAt: apiVersion.sunsetAt,
      daysUntilSunset,
      message: apiVersion.status === 'deprecated'
        ? `API version ${version} is deprecated. Please migrate to ${this.config.currentVersion}.`
        : undefined,
    };
  }

  /**
   * Add deprecation headers to response
   */
  addDeprecationHeaders(
    headers: Record<string, string>,
    version: string,
  ): Record<string, string> {
    const deprecationInfo = this.getDeprecationInfo(version);

    if (deprecationInfo.deprecated) {
      headers['Deprecation'] = 'true';
      headers['Sunset'] = deprecationInfo.sunsetAt?.toUTCString() || '';
      headers['Link'] = `</api/${this.config.currentVersion}/docs>; rel="successor-version"`;
    }

    return headers;
  }

  /**
   * Get API changelog
   */
  getChangelog(): Array<{
    version: string;
    date: Date;
    changes: string[];
    status: string;
  }> {
    return [
      {
        version: 'v1',
        date: new Date('2024-01-01'),
        changes: [
          'Initial API release',
          'Authentication endpoints',
          'User management',
          'Mentorship matching',
        ],
        status: 'active',
      },
    ];
  }

  /**
   * Validate version format
   */
  isValidVersionFormat(version: string): boolean {
    return /^v\d+$/.test(version);
  }

  /**
   * Get next version number
   */
  getNextVersion(): string {
    const currentNum = parseInt(this.config.currentVersion.replace('v', ''), 10);
    return `v${currentNum + 1}`;
  }
}
