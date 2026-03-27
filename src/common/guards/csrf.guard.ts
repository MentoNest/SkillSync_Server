import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // For GET requests, we don't validate CSRF
    if (request.method === 'GET') {
      return true;
    }

    // Get CSRF token from header
    const csrfToken = request.headers['x-csrf-token'];
    
    // Get CSRF token from cookie
    const csrfCookie = request.cookies?.['csrf-token'];
    
    // Validate both tokens exist and match
    if (!csrfToken || !csrfCookie) {
      this.logger.warn(`CSRF validation failed: missing tokens for ${request.method} ${request.path}`);
      throw new ForbiddenException('CSRF token validation failed');
    }
    
    if (csrfToken !== csrfCookie) {
      this.logger.warn(`CSRF validation failed: token mismatch for ${request.method} ${request.path}`);
      throw new ForbiddenException('CSRF token validation failed');
    }
    
    this.logger.debug(`CSRF validation successful for ${request.method} ${request.path}`);
    return true;
  }
}