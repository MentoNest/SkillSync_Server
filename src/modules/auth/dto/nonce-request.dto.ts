import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class NonceRequestDto {
  @ApiProperty({
    description: 'Stellar public key (G... address) of the wallet requesting authentication',
    example: 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3ZAPR4DM',
  })
  @IsString()
  publicKey: string;
}