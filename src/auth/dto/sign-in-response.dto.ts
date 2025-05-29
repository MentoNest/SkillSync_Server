import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { Role } from 'src/common/enum/role.enum';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'user@example.com' })
  @Expose()
  email: string;

  @ApiProperty({ enum: Role, example: Role.MENTOR })
  @Expose()
  role: Role;
  @ApiProperty({ example: 'John Doe' })
  @Expose()
  fullName?: string;

  @Exclude()
  password: string;

  @Exclude()
  refreshToken: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}

export class SignInResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty()
  user: UserResponseDto;

  constructor(partial: Partial<SignInResponseDto>) {
    Object.assign(this, partial);
  }
}
