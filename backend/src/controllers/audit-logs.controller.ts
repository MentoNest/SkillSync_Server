import { Controller, Get, Post, Query, Param, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { AuditLogsService, QueryAuditLogsDto } from '../services/audit-logs.service';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';

@Controller('audit-logs')
@UseGuards(RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles('admin')
  async getLogs(
    @Query('userId') userId?: string,
    @Query('eventType') eventType?: string,
    @Query('isSuspicious') isSuspicious?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const query: QueryAuditLogsDto = {
      userId,
      eventType,
      isSuspicious: isSuspicious !== undefined ? isSuspicious === 'true' : undefined,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };

    return this.auditLogsService.getLogs(query);
  }

  @Get(':id')
  @Roles('admin')
  async getLogById(@Param('id') id: string) {
    const log = await this.auditLogsService.getLogById(id);
    if (!log) {
      throw new NotFoundException(`Audit log with id ${id} not found`);
    }
    return log;
  }

  @Post('cleanup')
  @Roles('admin')
  async cleanupOldLogs(@Body('retentionDays') retentionDays?: number) {
    const days = retentionDays ? Number(retentionDays) : 90;
    return this.auditLogsService.cleanupOldLogs(days);
  }

  @Post('archive')
  @Roles('admin')
  async archiveAndCleanup(@Body('retentionDays') retentionDays?: number) {
    const days = retentionDays ? Number(retentionDays) : 90;
    return this.auditLogsService.archiveAndCleanup(days);
  }
}
