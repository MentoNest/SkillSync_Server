import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { DEPRECATED_API_VERSIONS, versionFromPath } from './versioning';

/** Adds `Deprecation` / `Sunset` headers to responses from deprecated versions. */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  constructor(
    private readonly deprecated: Readonly<Record<string, Date>> = DEPRECATED_API_VERSIONS,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const version = versionFromPath(req.originalUrl ?? req.url ?? '');
    const sunset = version ? this.deprecated[version] : undefined;
    if (sunset) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', sunset.toUTCString());
      res.setHeader('Link', '</docs/API_VERSIONING.md>; rel="deprecation"');
    }
    return next.handle();
  }
}
