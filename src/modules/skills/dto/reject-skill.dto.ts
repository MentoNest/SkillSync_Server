import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';

export class RejectSkillDto {
  @ApiProperty({ 
    description: 'Reason for rejecting the skill', 
    example: 'This skill already exists under a different name',
    maxLength: 500 
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
