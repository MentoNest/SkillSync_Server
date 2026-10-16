import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { buildLoginMessage } from '../nonce.service';

@Injectable()
export class WalletStrategy {
  verify(walletAddress: string, nonce: string, signatureB64: string): void {
    const wallet = walletAddress.toUpperCase();
    if (!StrKey.isValidEd25519PublicKey(wallet)) {
      throw new UnauthorizedException('Invalid wallet address');
    }
    let ok = false;
    try {
      const message = Buffer.from(buildLoginMessage(wallet, nonce), 'utf8');
      ok = Keypair.fromPublicKey(wallet).verify(message, Buffer.from(signatureB64, 'base64'));
    } catch {
      ok = false;
    }
    if (!ok) throw new UnauthorizedException('Invalid signature');
  }
}
