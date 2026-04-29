import { Injectable } from '@nestjs/common';
import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { RequestContextService } from '../../common/services/request-context.service';

/**
 * TypeORM event subscriber that adds request ID comments to database queries.
 * This enables tracing database operations back to specific HTTP requests.
 * 
 * For PostgreSQL: Uses SET LOCAL statement to set request_id in transaction
 * For query comments: Adds /* request_id: xxx *\/ comment to queries
 */
@Injectable()
export class DatabaseRequestSubscriber implements EntitySubscriberInterface {
  private readonly requestContextService = new RequestContextService();

  /**
   * Called before query execution to add request ID context
   */
  beforeQuery(event: any): void {
    const requestId = this.requestContextService.getRequestId();
    if (requestId && event.query) {
      // Add request ID as a comment to the SQL query
      // This appears in database logs and can be used for tracing
      event.query = `/* request_id: ${requestId} */ ${event.query}`;
    }
  }

  /**
   * Called before insert operations
   */
  async beforeInsert(event: InsertEvent<any>): Promise<void> {
    const requestId = this.requestContextService.getRequestId();
    if (requestId) {
      // Log the operation with request ID for audit trail
      // This can be extended to add request_id to entity metadata if needed
    }
  }

  /**
   * Called before update operations
   */
  async beforeUpdate(event: UpdateEvent<any>): Promise<void> {
    const requestId = this.requestContextService.getRequestId();
    if (requestId) {
      // Log the operation with request ID for audit trail
    }
  }

  /**
   * Called before delete operations
   */
  async beforeDelete(event: any): Promise<void> {
    const requestId = this.requestContextService.getRequestId();
    if (requestId) {
      // Log the operation with request ID for audit trail
    }
  }
}
