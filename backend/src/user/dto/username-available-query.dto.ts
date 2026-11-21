import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UsernameAvailableQueryDto {
  @ApiProperty({
    description: 'Username to check for availability.',
    example: 'alice_dev',
    minLength: 3,
    maxLength: 30,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username!: string;
}
