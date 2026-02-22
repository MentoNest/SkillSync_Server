import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { Keypair } from 'stellar-sdk';
import { StellarNonceService } from '../providers/nonce.service';
import { UserService } from '../../user/providers/user.service';

export const STELLAR_STRATEGY = 'stellar';

export interface StellarAuthPayload {
  publicKey: string;
  nonce: string;
  /** base64-encoded Ed25519 signature of the nonce */
  signature: string;
}

@Injectable()
export class StellarStrategy extends PassportStrategy(Strategy, STELLAR_STRATEGY) {
  constructor(
    private readonly nonceService: StellarNonceService,
    private readonly usersService: UserService,
  ) {
    super();
  }

  async validate(req: Request): Promise<unknown> {
    const { publicKey, nonce, signature } = (req.body ?? {}) as StellarAuthPayload;

    if (!publicKey || !nonce || !signature) {
      throw new UnauthorizedException('publicKey, nonce, and signature are required.');
    }

    const nonceValid = this.nonceService.consume(publicKey, nonce);
    if (!nonceValid) {
      throw new UnauthorizedException('Nonce is invalid or has expired.');
    }

    try {
      const keypair = Keypair.fromPublicKey(publicKey);
      const messageBuf = Buffer.from(nonce, 'utf8');
      const sigBuf = Buffer.from(signature, 'base64');

      const isValid = keypair.verify(messageBuf, sigBuf);
      if (!isValid) {
        throw new UnauthorizedException('Signature verification failed.');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Keypair.fromPublicKey throws on malformed keys
      throw new UnauthorizedException('Invalid Stellar public key.');
    }

    const user = await this.usersService.findOrCreateByPublicKey(publicKey);
    return user; // attached to req.user by Passport
  }
}