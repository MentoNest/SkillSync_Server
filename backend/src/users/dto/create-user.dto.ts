import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

const WALLET = /^G[A-Z2-7]{55}$/i;

export class CreateUserDto {
  @ApiProperty({ example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7' })
  @IsString()
  @Matches(WALLET, { message: 'walletAddress must be a valid Stellar public key' })
  walletAddress!: string;

  @ApiPropertyOptional({ example: 'alice@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'Alice Onchain' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;
}
