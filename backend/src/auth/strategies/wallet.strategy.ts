import { Injectable, Logger } from '@nestjs/common';
import { Keypair, StrKey } from '@stellar/stellar-sdk';

/**
 * #1145: Stellar wallet strategy.
 * Encapsulates Stellar SDK address validation (StrKey) and Ed25519
 * signature verification (Keypair.verify) used by wallet-based login.
 * Works for both mainnet and testnet accounts since public keys share
 * the same Ed25519 format on both networks.
 */
@Injectable()
export class WalletStrategy {
  private readonly logger = new Logger(WalletStrategy.name);

  /**
   * Validates a Stellar Ed25519 public key (G-address) using StrKey.
   */
  isValidAddress(address?: string | null): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }
    const trimmed = address.trim();
    return trimmed.length === 56 && StrKey.isValidEd25519PublicKey(trimmed.toUpperCase());
  }

  /**
   * Verifies that `signature` was produced by the owner of `walletAddress`
   * over the UTF-8 encoded `message` (the signed nonce).
   * Accepts signatures encoded as hex (128 chars) or base64.
   */
  verifySignature(walletAddress: string, message: string, signature: string): boolean {
    try {
      const keypair = Keypair.fromPublicKey(walletAddress.trim().toUpperCase());
      const signatureBuffer = this.decodeSignature(signature);
      if (signatureBuffer.length !== 64) {
        return false; // Ed25519 signatures must be exactly 64 bytes
      }
      return keypair.verify(Buffer.from(message, 'utf8'), signatureBuffer);
    } catch (error: any) {
      this.logger.warn(`Stellar signature verification failed: ${error?.message}`);
      return false;
    }
  }

  /**
   * Decodes a hex or base64 encoded signature into a raw buffer.
   */
  private decodeSignature(signature: string): Buffer {
    const trimmed = signature.trim();
    if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    return Buffer.from(trimmed, 'base64');
  }
}
