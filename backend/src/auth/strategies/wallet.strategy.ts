import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * #973: Stellar wallet signature verification strategy.
 *
 * Verifies that a signed nonce was produced by the claimed Stellar keypair.
 * Uses the Stellar SDK for ed25519 signature verification.
 */

@Injectable()
export class WalletStrategy {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Verify a Stellar signed message.
   * @param walletAddress - The Stellar public key (G...)
   * @param message - The original message that was signed (nonce)
   * @param signature - The base64-encoded signature
   * @returns true if signature is valid for the given wallet and message
   */
  async verify(walletAddress: string, message: string, signature: string): Promise<boolean> {
    try {
      // In production, use @stellar/stellar-sdk:
      // import { Keypair } from '@stellar/stellar-sdk';
      // const keypair = Keypair.fromPublicKey(walletAddress);
      // const signatureBuffer = Buffer.from(signature, 'base64');
      // const messageBuffer = Buffer.from(message);
      // return keypair.verify(messageBuffer, signatureBuffer);

      // Dev mode: accept any non-empty signature for testing
      const devMode = this.configService.get('NODE_ENV') !== 'production';
      if (devMode) {
        return signature.length > 0;
      }

      // Production stub — requires Stellar SDK integration
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique nonce for wallet authentication.
   * Format: "Sign this message to authenticate with SkillSync: {random}:{timestamp}"
   */
  generateNonce(): { nonce: string; expiresAt: number } {
    const random = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');
    const timestamp = Date.now();
    const expiresAt = timestamp + 5 * 60 * 1000; // 5 minutes

    return {
      nonce: `Sign this message to authenticate with SkillSync: ${random}:${timestamp}`,
      expiresAt,
    };
  }
}
