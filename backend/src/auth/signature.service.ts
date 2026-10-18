import { Injectable } from '@nestjs/common';
import { WalletStrategy } from './strategies/wallet.strategy';

@Injectable()
export class SignatureService {
  constructor(private readonly wallets: WalletStrategy) {}

  /** Verifies an Ed25519 signature made by the wallet's key over the login message. */
  verify(walletAddress: string, nonce: string, signatureB64: string): void {
    this.wallets.verify(walletAddress, nonce, signatureB64);
  }
}
