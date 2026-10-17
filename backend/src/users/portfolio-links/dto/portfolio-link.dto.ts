import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PortfolioPlatform } from '../entities/portfolio-link.entity';

export class CreatePortfolioLinkDto {
  @ApiProperty({ example: 'https://github.com/octocat', maxLength: 2048 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({ enum: PortfolioPlatform })
  @IsOptional()
  @IsEnum(PortfolioPlatform)
  platform?: PortfolioPlatform;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}
