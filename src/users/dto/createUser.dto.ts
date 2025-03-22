import { ApiProperty } from "@nestjs/swagger";

export class CreateUserDto {
  @ApiProperty({ example: 'john_doe', description: 'The username of the user' })
  readonly username: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email address' })
  readonly email: string;

  @ApiProperty({ example: 'P@ssw0rd!', description: 'User password' })
  readonly password: string;
}
