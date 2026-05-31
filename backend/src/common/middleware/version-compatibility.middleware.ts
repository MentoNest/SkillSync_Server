import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class VersionCompatibilityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(VersionCompatibilityMiddleware.name);
  // List of versions that are currently deprecated
  // Note: 'v1' is the current version, so we might mock 'v0' as deprecated for testing
  private readonly deprecatedVersions = ['v0'];

  use(req: Request, res: Response, next: NextFunction) {
    // URL pattern with global prefix 'api' and version 'vX' -> /api/vX/something
    const urlParts = req.originalUrl.split('?')[0].split('/');
    
    // Check if the route has the prefix and a version part
    // e.g., urlParts = ['', 'api', 'v1', ...]
    const versionPart = urlParts.length > 2 && urlParts[1] === 'api' ? urlParts[2] : null;

    if (versionPart && this.deprecatedVersions.includes(versionPart)) {
      this.logger.warn(
        `Deprecated API version (${versionPart}) accessed by IP: ${req.ip} for route: ${req.originalUrl}`,
      );
      res.setHeader('Deprecation', 'true');
    }

    next();
  }
}
