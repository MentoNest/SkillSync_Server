import { IsEnum, IsOptional, IsString, IsBoolean, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditEventType } from '../entities/audit.entity';

export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: AuditEventType, description: 'Filter by event type' })
  @IsOptional()
  @IsEnum(AuditEventType)
  eventType?: AuditEventType;

  @ApiPropertyOptional({ description: 'Filter by IP address' })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'Filter by success status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  success?: boolean;

  @ApiPropertyOptional({ description: 'Start date for filtering (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 50, description: 'Number of results to return' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({ default: 0, description: 'Number of results to skip' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}

export class AuditLogResponseDto {
  id: string;
  eventType: AuditEventType;
  userId: string | null;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  metadata: Record<string, unknown> | null;
  success: boolean;
  failureReason: string | null;
  createdAt: Date;
}

export class AuditLogsPaginatedResponseDto {
  data: AuditLogResponseDto[];
  total: number;
  limit: number;
  offset: number;
}
