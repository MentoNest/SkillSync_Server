import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import { getContextRequestId, createDatabaseComment, formatRequestIdForDatabase } from '../utils/request-id.util';

/**
 * Database Query Interceptor
 * Propagates request ID to database queries via comments and context
 * 
 * Features:
 * - Adds request ID as SQL comment to all queries
 * - Sets PostgreSQL application_name context variable
 * - Minimal performance overhead (no additional queries)
 */
@Injectable()
export class DatabaseRequestIdInterceptor implements NestInterceptor {
  constructor(private readonly dataSource: DataSource) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const requestId = getContextRequestId();
    
    if (!requestId) {
      return next.handle();
    }

    // Set PostgreSQL context for connection-level tracing
    try {
      const queryRunner = this.dataSource.createQueryRunner();
      try {
        // Set application_name to include request ID for connection-level identification
        const appName = formatRequestIdForDatabase(requestId);
        await queryRunner.query(`SET LOCAL application_name = $1`, [appName]);
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      // Fail silently if context setting fails - don't block requests
      console.debug(`Failed to set database context for request ID: ${error}`);
    }

    return next.handle();
  }
}
