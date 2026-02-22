import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './providers/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditQueryDto, AuditLogsPaginatedResponseDto, AuditLogResponseDto } from './dto/create-audit.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Get all audit logs with filtering', 
    description: 'Retrieve paginated audit logs. Admin only.' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Returns paginated audit logs',
    type: AuditLogsPaginatedResponseDto 
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden - Admin access required' })
  async findAll(@Query() query: AuditQueryDto): Promise<AuditLogsPaginatedResponseDto> {
    const { data, total } = await this.auditService.findAll({
      userId: query.userId,
      eventType: query.eventType,
      ipAddress: query.ipAddress,
      success: query.success,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset,
    });

    // Parse metadata JSON strings back to objects for the response
    const formattedData: AuditLogResponseDto[] = data.map(log => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }));

    return {
      data: formattedData,
      total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }

  @Get('user/:userId')
  @ApiOperation({ 
    summary: 'Get audit logs for a specific user',
    description: 'Retrieve recent audit logs for a user. Admin only.' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Returns user audit logs',
    type: [AuditLogResponseDto] 
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden - Admin access required' })
  async findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit?: number,
  ): Promise<AuditLogResponseDto[]> {
    const logs = await this.auditService.findByUser(userId, limit ?? 50);
    
    return logs.map(log => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }));
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get a specific audit log by ID',
    description: 'Retrieve a single audit log entry. Admin only.' 
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Returns the audit log',
    type: AuditLogResponseDto 
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Audit log not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden - Admin access required' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLogResponseDto | null> {
    const log = await this.auditService.findOne(id);
    
    if (!log) {
      return null;
    }

    return {
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    };
  }
}
