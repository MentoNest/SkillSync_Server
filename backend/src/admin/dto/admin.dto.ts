import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/dto/pagination-query.dto';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { RoleName } from '../../rbac/roles';
import { SessionStatus } from '../../sessions/session-rules';
import { ReportStatus } from '../entities/content-report.entity';

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches display name, username or wallet address' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class AssignRoleDto {
  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName)
  role!: RoleName;
}

export class ListSessionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}

export class CancelSessionAdminDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateReportDto {
  @ApiProperty({ example: 'user' })
  @IsIn(['user', 'session', 'profile', 'message'])
  targetType!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  targetId!: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class ListReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}

export class ResolveReportDto {
  @ApiProperty({ enum: [ReportStatus.RESOLVED, ReportStatus.DISMISSED] })
  @IsIn([ReportStatus.RESOLVED, ReportStatus.DISMISSED])
  status!: ReportStatus.RESOLVED | ReportStatus.DISMISSED;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AuditEvent })
  @IsOptional()
  @IsEnum(AuditEvent)
  event?: AuditEvent;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;
}
