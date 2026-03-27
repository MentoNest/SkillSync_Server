import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ 
    example: 'john@example.com', 
    description: 'The email address of the user', 
    format: 'email' 
  })
  @IsEmail()
  email: string;

  @ApiProperty({ 
    example: 'John Doe', 
    description: 'The full name of the user', 
    minLength: 2 
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ 
    example: 'password123', 
    description: 'The password for the user account', 
    minLength: 8 
  })
  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginDto {
  @ApiProperty({ 
    example: 'john@example.com', 
    description: 'The email address of the user', 
    format: 'email' 
  })
  @IsEmail()
  email: string;

  @ApiProperty({ 
    example: 'password123', 
    description: 'The password for the user account' 
  })
  @IsString()
  password: string;
}

export class AuthResponse {
  @ApiProperty({ 
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 
    description: 'The access token for authentication' 
  })
  accessToken: string;

  @ApiProperty({ 
    example: 'd1f1e2f3g4h5i6j7k8l9m0n...', 
    description: 'The refresh token for renewing access' 
  })
  refreshToken: string;
}
