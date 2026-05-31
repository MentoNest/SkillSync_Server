import { IsString, IsNotEmpty, MaxLength, IsOptional, IsEnum, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReportStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ReportType {
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  OTHER = 'other',
}

export class CreateReportDto {
  @IsString()
  @IsNotEmpty()
  reportedUserId: string;

  @IsEnum(ReportType)
  type: ReportType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}

export class ReportQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @IsOptional()
  @IsString()
  reportedUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class ResolveReportDto {
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  adminNotes: string;
}