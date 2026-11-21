import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { PortfolioPlatform } from '../portfolio-link.entity';

export class CreatePortfolioLinkDto {
  @ApiProperty({ example: 'https://github.com/alice' })
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({ enum: PortfolioPlatform, description: 'Optional; detected from URL when omitted' })
  @IsOptional()
  @IsEnum(PortfolioPlatform)
  platform?: PortfolioPlatform;

  @ApiPropertyOptional({ example: 'My GitHub', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayTitle?: string | null;
}

export class PortfolioLinkResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PortfolioPlatform }) platform!: PortfolioPlatform;
  @ApiProperty() url!: string;
  @ApiPropertyOptional({ nullable: true }) displayTitle!: string | null;
  @ApiProperty() createdAt!: Date;
}
