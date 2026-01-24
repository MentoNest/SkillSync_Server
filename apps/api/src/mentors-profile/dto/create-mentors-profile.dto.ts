import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, MaxLength } from 'class-validator';

export class CreateMentorProfileDto {
  @ApiProperty({
    description: 'Professional headline',
    maxLength: 150,
    example: 'Senior Software Engineer | Full-Stack Developer',
  })
  @IsString()
  @MaxLength(150)
  headline!: string;

  @ApiProperty({
    description: 'Hourly rate in NGN minor units (kobo)',
    example: 1500000,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  rateMinor!: number;

  @ApiProperty({
    description: 'Years of professional experience',
    example: 5,
    minimum: 0,
    maximum: 50,
  })
  @IsInt()
  @Min(0)
  @Max(50)
  yearsExp!: number;
}
