import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ApiVersioningService } from './api-versioning.service';

@Injectable()
export class ApiVersioningMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiVersioningMiddleware.name);

  constructor(private readonly versioningService: ApiVersioningService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Extract version from URL path (e.g., /api/v1/users)
    const versionMatch = req.path.match(/\/api\/(v\d+)\//);
    const version = versionMatch ? versionMatch[1] : this.versioningService.getCurrentVersion();

    // Add version to request for downstream use
    (req as any).apiVersion = version;

    // Check if version is supported
    if (!this.versioningService.isVersionSupported(version)) {
      res.status(400).json({
        statusCode: 400,
        message: `API version ${version} is not supported`,
        error: 'Bad Request',
        supportedVersions: this.versioningService.getSupportedVersions().map((v) => v.version),
      });
      return;
    }

    // Add deprecation headers if needed
    const deprecationHeaders = this.versioningService.addDeprecationHeaders({}, version);
    Object.entries(deprecationHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Add API version header
    res.setHeader('X-API-Version', version);

    // Log deprecation warnings
    if (this.versioningService.isVersionDeprecated(version)) {
      const deprecationInfo = this.versioningService.getDeprecationInfo(version);
      this.logger.warn(
        `Deprecated API version ${version} used. ${deprecationInfo.message}`,
      );
    }

    next();
  }
}
