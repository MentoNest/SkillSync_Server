import { IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { PortfolioPlatform } from '../entities/portfolio-link.entity';

export class CreatePortfolioLinkDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;

  @IsOptional()
  @IsEnum(PortfolioPlatform)
  platform?: PortfolioPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;
}
