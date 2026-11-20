import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-custom';
import { InvalidCredentialsException } from '../../common/errors/app-exceptions';
import { AuthService } from '../auth.service';
import { AuthUser } from '../auth.types';

/** Authenticates a request body `{ address, signature }` against the wallet's pending nonce. */
@Injectable()
export class WalletStrategy extends PassportStrategy(Strategy, 'wallet') {
  constructor(private readonly auth: AuthService) {
    super();
  }

  async validate(req: Request): Promise<AuthUser> {
    const { address, signature } = (req.body ?? {}) as { address?: unknown; signature?: unknown };
    if (typeof address !== 'string' || typeof signature !== 'string') {
      throw new InvalidCredentialsException('address and signature are required');
    }
    return this.auth.verifyWallet(address, signature);
  }
}
