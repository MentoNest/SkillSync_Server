import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditEventType, AuditLog } from './entities/audit-log.entity';
import { RolesGuard } from '../guards/roles.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Roles } from '../decorators/roles.decorator';

export class RetentionBodyDto {
  @ApiPropertyOptional({
    description:
      'Retention window in days. Defaults to AUDIT_LOG_RETENTION_DAYS (90 when unset).',
    minimum: 1,
    maximum: 3650,
    example: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  retentionDays?: number;
}

export class AuditLogResponseDto {
  @ApiProperty({ example: '5b7b6f1c-2c1e-4a2f-9a1a-2f0d0a1b2c3d' })
  id: string;

  @ApiProperty({ nullable: true, example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string | null;

  @ApiProperty({ enum: AuditEventType, example: AuditEventType.LOGIN_FAILURE })
  eventType: string;

  @ApiProperty({ nullable: true, example: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ' })
  walletAddress: string | null;

  @ApiProperty({ nullable: true, example: '203.0.113.10' })
  ipAddress: string | null;

  @ApiProperty({ nullable: true, example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
  userAgent: string | null;

  @ApiProperty({ example: '2026-01-01T12:00:00.000Z' })
  timestamp: Date;

  @ApiProperty({ example: { reason: 'INVALID_SIGNATURE' } })
  details: Record<string, any>;

  @ApiProperty({ example: true })
  isSuspicious: boolean;

  @ApiProperty({ nullable: true, example: 'INVALID_SIGNATURE' })
  suspiciousReason: string | null;
}

/**
 * #1320: read access to the authentication audit trail.
 *
 * Every route requires a valid access token *and* the `admin` role — the audit
 * trail exposes IP addresses, user agents and wallet addresses, so it must not
 * be reachable by regular mentors/mentees.
 */
@ApiTags('Security & Audit')
@ApiBearerAuth('Bearer Auth')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({
    summary: 'List authentication audit events',
    description:
      'Paginated, filterable view over the audit trail. Supports filtering by user, wallet address, event type, suspicious flag and a timestamp range. Requires the admin role.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Matching audit events' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid access token' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  async getLogs(@Query() query: AuditLogQueryDto) {
    return this.auditService.getLogs({ ...query });
  }

  @Get('summary')
  @Roles('admin')
  @ApiOperation({
    summary: 'Event type breakdown for the compliance dashboard',
    description:
      'Returns the number of events per event type for the supplied filter window, newest window first.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Event counts grouped by event type' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  async getSummary(@Query() query: AuditLogQueryDto) {
    return this.auditService.getEventTypeSummary({ ...query });
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Fetch a single audit event by id' })
  @ApiParam({ name: 'id', description: 'Audit log UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'The requested audit event' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No audit event with that id' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  async getLogById(@Param('id') id: string): Promise<AuditLogResponseDto | null> {
    return this.auditService.getLogById(id);
  }

  @Post('cleanup')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete audit events older than the retention window',
    description:
      'Removes every event older than `retentionDays` (default: AUDIT_LOG_RETENTION_DAYS or 90). The same sweep also runs automatically once per day.',
  })
  @ApiBody({ type: RetentionBodyDto, required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Number of removed events' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  async cleanup(@Body() body: RetentionBodyDto) {
    return this.auditService.cleanupOldLogs(body?.retentionDays);
  }

  @Post('archive')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive then delete audit events older than the retention window',
    description:
      'Returns the expired events so they can be shipped to cold storage before the rows are removed. The response therefore contains the archived payloads themselves.',
  })
  @ApiBody({ type: RetentionBodyDto, required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Archived payloads and delete count' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Admin role required' })
  async archive(@Body() body: RetentionBodyDto) {
    const result = await this.auditService.archiveAndCleanup(body?.retentionDays);
    return {
      archivedCount: result.archivedCount,
      deletedCount: result.deletedCount,
      retentionDays: result.retentionDays,
      cutoff: result.cutoff,
      archivedLogs: result.archivedLogs as AuditLog[],
    };
  }
}
