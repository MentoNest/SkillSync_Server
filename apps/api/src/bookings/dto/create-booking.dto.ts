import { IsNotEmpty, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({
    description: 'The ID of the mentor profile to book with',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  mentorProfileId!: string;

  @ApiProperty({
    description: 'The start time of the session (ISO 8601)',
    example: '2023-10-27T10:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  start!: string;

  @ApiProperty({
    description: 'The end time of the session (ISO 8601)',
    example: '2023-10-27T11:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  end!: string;
}
