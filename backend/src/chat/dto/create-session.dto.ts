import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({ description: 'UUID of the mentor user' })
  @IsUUID()
  @IsNotEmpty()
  mentorId: string;

  @ApiProperty({ description: 'UUID of the mentee user' })
  @IsUUID()
  @IsNotEmpty()
  menteeId: string;

  @ApiPropertyOptional({ description: 'On-chain Stellar contract session identifier' })
  @IsString()
  @IsOptional()
  contractSessionId?: string;
}
