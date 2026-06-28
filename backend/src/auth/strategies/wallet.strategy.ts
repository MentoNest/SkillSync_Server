import { Injectable } from '@nestjs/common';
import passport from 'passport';
import { Keypair } from 'stellar-sdk';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { UserService } from '../user.service';

export interface WalletAuthRequest {
  wallet: string;
  signature: string;
  nonce: string;
  network: 'mainnet' | 'testnet';
}

/**
 * Custom Passport strategy for Stellar wallet authentication.
 *
 * Flow: client supplies wallet + nonce + ed25519 signature → strategy verifies
 * the signature against the nonce stored in Redis and resolves the User entity.
 *
 * Register with AuthGuard('wallet') after adding WalletStrategy to providers.
 */
@Injectable()
export class WalletStrategy {
  readonly name = 'wallet';

  // Injected by the Passport framework at authentication time
  declare success: (user: any, info?: any) => void;
  declare fail: (challenge: any, status?: number) => void;
  declare error: (err: Error) => void;

  constructor(
    private readonly redisService: RedisService,
    private readonly userService: UserService,
  ) {
    passport.use(this.name, this as any);
  }

  async authenticate(req: Request, _options?: unknown): Promise<void> {
    const { wallet, signature, nonce, network } = (req.body ?? {}) as WalletAuthRequest;

    if (!wallet || !signature || !nonce || !network) {
      return this.fail(
        { message: 'wallet, signature, nonce, and network are required' },
        400,
      );
    }

    try {
      const storedNonce = await this.redisService.get(wallet, 'nonce');
      if (!storedNonce || storedNonce !== nonce) {
        return this.fail({ message: 'Nonce expired or invalid' }, 401);
      }

      if (!this.verifySignature(wallet, signature, nonce, network)) {
        return this.fail({ message: 'Invalid wallet signature' }, 401);
      }

      const user = await this.userService.findOrCreateByWallet(wallet);
      this.success(user);
    } catch (err) {
      this.error(err as Error);
    }
  }

  private verifySignature(
    wallet: string,
    signature: string,
    nonce: string,
    network: string,
  ): boolean {
    try {
      const message = Buffer.from(`${network}:${nonce}`, 'utf8');
      const keypair = Keypair.fromPublicKey(wallet);
      return keypair.verify(message, Buffer.from(signature, 'base64'));
    } catch {
      return false;
    }
  }
}
