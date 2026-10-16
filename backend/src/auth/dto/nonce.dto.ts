import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const WALLET = /^G[A-Z2-7]{55}$/i;

export class NonceRequestDto {
  @ApiProperty({ example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7' })
  @IsString()
  @Matches(WALLET, { message: 'walletAddress must be a valid Stellar public key' })
  walletAddress!: string;
}
