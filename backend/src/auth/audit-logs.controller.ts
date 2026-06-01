import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiPaginationQuery } from '../common/pagination/decorators/api-pagination-query.decorator';
import { AdminAccessGuard } from './admin-access.guard';
import { AuditLogService } from './audit-log.service';
import { AuditEventType } from './entities/audit-log.entity';

@ApiTags('audit-logs')
@Controller('auth/audit-logs')
@UseGuards(AdminAccessGuard)
export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiPaginationQuery()
  async list(@Query() query: Record<string, string | undefined>) {
    const limit = this.parseInt(query.limit, 10, 1, 100);
    const page = this.parseInt(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const eventType = this.parseEventType(query.eventType);
    const start = this.parseDate(query.start);
    const end = this.parseDate(query.end);
    const isSuspicious = this.parseBoolean(query.isSuspicious);

    return this.auditLogService.listLogs({
      userId: query.userId,
      eventType,
      isSuspicious,
      start,
      end,
      limit,
      page,
    });
  }

  private parseInt(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (!value) {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    if (parsed < min) {
      return min;
    }
    if (parsed > max) {
      return max;
    }
    return parsed;
  }

  private parseDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private parseBoolean(value: string | undefined): boolean | undefined {
    if (!value) {
      return undefined;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return undefined;
  }

  private parseEventType(value: string | undefined): AuditEventType | undefined {
    if (!value) {
      return undefined;
    }
    return (Object.values(AuditEventType) as string[]).includes(value)
      ? (value as AuditEventType)
      : undefined;
  }
}
