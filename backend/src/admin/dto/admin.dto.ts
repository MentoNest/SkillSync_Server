import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Role } from '../../auth/auth.types';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { IsValidWalletAddress } from '../../common/validators';
import { UserStatus } from '../../user/user-status.enum';
import { UserResponseDto } from '../../user/dto/user-response.dto';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { AdminSessionStatus } from '../entities/admin-session.entity';
import {
  ReportStatus,
  ReportTargetType,
} from '../entities/content-report.entity';
import { UserSuspension } from '../entities/user-suspension.entity';

export class AdminUserParamDto {
  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @IsValidWalletAddress()
  walletAddress!: string;
}

export class AdminSuspensionUserParamDto {
  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @IsValidWalletAddress()
  userId!: string;
}

export class SuspendUserDto {
  @ApiProperty({
    description: 'Reason for suspending the account.',
    example: 'Repeated violation of community guidelines.',
    minLength: 3,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Suspension duration in days. Omit or pass null for a permanent suspension.',
    example: 7,
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 3650,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  duration?: number | null;
}

export class UnsuspendUserDto {
  @ApiPropertyOptional({
    description: 'Optional note explaining why the suspension was lifted.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'mentor' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  role?: string;

  @ApiPropertyOptional({
    description: 'Matches username, display name or wallet address.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'updatedAt', 'walletAddress', 'status', 'role'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'walletAddress', 'status', 'role'])
  sort?: string;
}

export class AssignRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;
}

export class ListSessionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AdminSessionStatus })
  @IsOptional()
  @IsEnum(AdminSessionStatus)
  status?: AdminSessionStatus;

  @ApiPropertyOptional({ description: 'Matches the mentor or mentee wallet.' })
  @IsOptional()
  @IsValidWalletAddress()
  walletAddress?: string;

  @ApiPropertyOptional({ description: 'Matches session id or notes.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'startTime', 'endTime', 'status'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'startTime', 'endTime', 'status'])
  sort?: string;
}

export class CancelSessionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export enum DisputeResolution {
  COMPLETE = 'complete',
  CANCEL = 'cancel',
  NO_ACTION = 'no_action',
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: DisputeResolution })
  @IsEnum(DisputeResolution)
  resolution!: DisputeResolution;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  targetId!: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class ListReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportTargetType })
  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsValidWalletAddress()
  reporterId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({
    enum: ['createdAt', 'updatedAt', 'resolvedAt', 'status'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'resolvedAt', 'status'])
  sort?: string;
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

export enum ReportAction {
  REMOVE_CONTENT = 'remove_content',
  WARN_USER = 'warn_user',
  SUSPEND_USER = 'suspend_user',
  DISMISS = 'dismiss',
}

export class ReportActionDto {
  @ApiProperty({ enum: ReportAction })
  @IsEnum(ReportAction)
  action!: ReportAction;

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

  @ApiPropertyOptional({ description: 'Wallet address of the actor.' })
  @IsOptional()
  @IsValidWalletAddress()
  walletAddress?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'event'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'event'])
  sort?: string;
}

export class AnalyticsRangeQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;
}

export class SuspendUserResponseDto extends UserResponseDto {
  @ApiPropertyOptional({
    description: 'Active suspension record created for the user.',
    type: () => UserSuspension,
    nullable: true,
  })
  suspension!: UserSuspension | null;
}

export class UnsuspendUserResponseDto extends UserResponseDto {
  @ApiProperty({
    description: 'Timestamp when the suspension was lifted.',
    type: String,
    format: 'date-time',
  })
  liftedAt!: Date;
}

export class SuspensionPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
  @ApiPropertyOptional() hasNext?: boolean;
  @ApiPropertyOptional() hasPrev?: boolean;
}

export class PaginatedSuspendedUsersResponseDto {
  @ApiProperty({ type: () => [UserSuspension] })
  data!: UserSuspension[];

  @ApiProperty({ type: () => SuspensionPaginationMetaDto })
  meta!: SuspensionPaginationMetaDto;
}
