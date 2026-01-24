import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ProfileResponseDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @Expose()
  email: string;

  @ApiPropertyOptional({
    description: 'User display name',
    example: 'John Doe',
  })
  @Expose()
  name: string | null;

  @ApiPropertyOptional({
    description: 'User biography',
    example: 'Passionate software developer and mentor',
  })
  @Expose()
  bio: string | null;

  @ApiPropertyOptional({
    description: 'URL to user avatar image',
    example: 'https://example.com/avatar.jpg',
  })
  @Expose()
  avatarUrl: string | null;

  @ApiPropertyOptional({
    description: 'User timezone in IANA format',
    example: 'America/New_York',
  })
  @Expose()
  timezone: string;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Last profile update timestamp',
    example: '2024-01-24T00:00:00.000Z',
  })
  @Expose()
  updatedAt: Date;
}
