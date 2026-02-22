import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkWalletDto {
    @ApiProperty({
        description: 'Stellar public key (G… address) of the wallet to link',
        example: 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3ZAPR4DM3',
    })
    @IsString({ message: 'address must be a string' })
    @IsNotEmpty({ message: 'address is required' })
    address: string;

    @ApiProperty({
        description: 'Base64-encoded Ed25519 signature of the server-issued nonce',
        example: 'ABC123...==',
    })
    @IsString({ message: 'signature must be a string' })
    @IsNotEmpty({ message: 'signature is required' })
    signature: string;

    @ApiProperty({
        description: 'Server-issued nonce that was signed',
        example: 'a1b2c3d4e5f6789012345678901234567890abcdef',
    })
    @IsString({ message: 'nonce must be a string' })
    @IsNotEmpty({ message: 'nonce is required' })
    nonce: string;
}
