import { ApiProperty } from '@nestjs/swagger';
import { RefreshToken } from 'src/auth/entities/refresh-token.entity';
import { Role } from 'src/common/enums/Role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'john_doe', description: 'The username of the user' })
  readonly name: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'User email address',
  })
  readonly email: string;

  @ApiProperty({ example: 'P@ssw0rd!', description: 'User password' })
  readonly password: string;

  @ApiProperty({ example: 'user', description: 'User role' })
  readonly role: Role;

  @ApiProperty({ example: '', description: 'User tokens' })
  readonly refreshTokens: RefreshToken[];
  
}
