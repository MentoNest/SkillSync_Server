import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { AuthService } from '../auth.service';

@Injectable()
export class WalletStrategy extends PassportStrategy(Strategy, 'wallet') {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(req: Request): Promise<any> {
    const { walletAddress, signature, nonce } = req.body;

    if (!walletAddress || !signature || !nonce) {
      throw new Error('Missing wallet authentication parameters');
    }

    const isValid = await this.authService.verifySignature(
      walletAddress,
      signature,
      nonce,
    );

    if (!isValid) {
      throw new Error('Invalid wallet signature');
    }

    return {
      walletAddress,
      verified: true,
    };
  }
}
