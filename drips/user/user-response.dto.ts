import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UserResponseDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @Expose()
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @Expose()
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  @Expose()
  lastName: string;

  @ApiProperty({
    description: 'User creation timestamp',
    example: '2024-01-24T10:30:00.000Z',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'User last update timestamp',
    example: '2024-01-24T10:30:00.000Z',
  })
  @Expose()
  updatedAt: Date;
}