import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class StartSessionDto {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({
    description: 'Session ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sessionId!: string;
}

export class CompleteSessionDto {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({
    description: 'Session ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sessionId!: string;
}
