import { IsArray, IsNumber, IsOptional, IsString, IsDate, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MilestoneDto {
  @IsString()
  description: string;

  @IsNumber()
  percentage: number;
}

export class CreateMilestoneSessionDto {
  @IsString()
  sessionId: string; // Blockchain session ID

  @IsString()
  sellerId: string;

  @IsNumber()
  amount: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones: MilestoneDto[];

  @IsOptional()
  @IsDate()
  deadline?: Date;

  @IsOptional()
  @IsString()
  tokenAddress?: string;
}