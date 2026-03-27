import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingApprovalStatus } from '../../../common/enums/skill-status.enum';

export class ApproveListingDto {
  @ApiProperty({ 
    description: 'Approval status', 
    enum: ListingApprovalStatus,
    example: ListingApprovalStatus.APPROVED 
  })
  @IsEnum(ListingApprovalStatus)
  status: ListingApprovalStatus;

  @ApiPropertyOptional({ 
    description: 'Reason for rejection (required if status is rejected)',
    example: 'Content does not meet our community guidelines'
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class ListingAnalyticsResponseDto {
  @ApiProperty({ description: 'View count' })
  viewCount: number;

  @ApiProperty({ description: 'Click count' })
  clickCount: number;

  @ApiProperty({ description: 'Conversion count' })
  conversionCount: number;
}