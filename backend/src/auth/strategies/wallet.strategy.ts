import { Injectable, Logger } from '@nestjs/common';
import { Keypair, StrKey } from '@stellar/stellar-sdk';

/**
 * #1314: Stellar wallet signature verification.
 *
 * Two address forms are accepted:
 *  - `G...` classic account: used as the Ed25519 public key directly;
 *  - `M...` muxed account (SEP-23): the Ed25519 key is recovered from the
 *    med25519 payload, so a modern wallet or a smart contract address can sign
 *    the challenge too. Verification itself is identical once the key is known.
 *
 * A `G` address and a `M` address that point at the same underlying account are
 * therefore interchangeable for login, which is what users expect when a
 * wallet shows a muxed address.
 */
@Injectable()
export class WalletStrategy {
  private readonly logger = new Logger(WalletStrategy.name);

  /**
   * Validates a Stellar public key. Accepts a 56-character `G` (Ed25519) or
   * `M` (muxed, SEP-23) address.
   */
  isValidAddress(address?: string | null): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }
    const trimmed = address.trim().toUpperCase();
    return StrKey.isValidEd25519PublicKey(trimmed) || StrKey.isValidMed25519PublicKey(trimmed);
  }

  /**
   * Canonical form of an address: uppercase, as Stellar encodes it. Callers
   * store the lower case version, so this is only used for key material.
   */
  static normalize(address: string): string {
    return address.trim().toUpperCase();
  }

  /**
   * Resolves any accepted address form to the Ed25519 `Keypair` that has to
   * have produced the signature. Returns `null` for an unusable address instead
   * of throwing, so callers can turn it into a single 401.
   */
  resolveKeypair(address?: string | null): Keypair | null {
    if (!this.isValidAddress(address)) {
      return null;
    }

    const normalized = WalletStrategy.normalize(address as string);

    try {
      if (StrKey.isValidEd25519PublicKey(normalized)) {
        return Keypair.fromPublicKey(normalized);
      }

      // SEP-23 muxed account: the first 32 bytes of the payload are the raw
      // Ed25519 public key, the rest encodes the multiplexed id. Re-encoding the
      // raw key as a G address keeps one code path for the verification.
      const raw = StrKey.decodeMed25519PublicKey(normalized).subarray(0, 32);
      return Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(raw));
    } catch (error) {
      this.logger.warn(
        `Stellar address could not be resolved to a keypair: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Verifies that `signature` was produced by the owner of `walletAddress` over
   * the UTF-8 encoded `message` (the signed nonce).
   *
   * Accepts signatures encoded as hex (128 characters) or base64. Stellar's
   * `signDecorated`/`sign` helpers return base64, while most tooling emits hex.
   */
  verifySignature(walletAddress: string, message: string, signature: string): boolean {
    if (!message || !signature) {
      return false;
    }

    const keypair = this.resolveKeypair(walletAddress);
    if (!keypair) {
      return false;
    }

    const signatureBuffer = this.decodeSignature(signature);
    if (signatureBuffer.length !== 64) {
      return false; // Ed25519 signatures are always exactly 64 bytes
    }

    try {
      return keypair.verify(Buffer.from(message, 'utf8'), signatureBuffer);
    } catch (error) {
      this.logger.warn(
        `Stellar signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Decodes a hex or base64 encoded signature into a raw buffer.
   * Returns an empty buffer for anything undecodable, which the length check
   * in {@link verifySignature} rejects.
   */
  private decodeSignature(signature: string): Buffer {
    const trimmed = signature.trim();
    if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }
    return Buffer.from(trimmed, 'base64');
  }
}
