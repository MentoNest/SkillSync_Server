import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

/**
 * Field-level encryption (issue #1481).
 *
 * - AES-256-GCM, random 96-bit IV per value, authenticated.
 * - Ciphertext format: `v1:<keyId>:<iv>:<tag>:<data>` (base64url parts), so a
 *   value always says which key encrypted it and keys can be rotated: new
 *   writes use the active key, old values still decrypt with retired keys.
 * - `blindIndex()` is a keyed HMAC of the normalised value for exact-match
 *   lookups (e.g. email) without decrypting every row.
 *
 * Environment:
 *   ENCRYPTION_KEY_ID       id of the active key (default "k1")
 *   ENCRYPTION_KEY          base64, 32 bytes - the active key
 *   ENCRYPTION_OLD_KEYS     "id:base64,id:base64" retired keys (decrypt only)
 *   ENCRYPTION_INDEX_KEY    base64, >= 32 bytes - key for blind indexes
 */
const PREFIX = 'v1';

export interface EncryptionKeyConfig {
  activeKeyId: string;
  keys: Record<string, Buffer>;
  indexKey: Buffer;
}

const b64 = (buf: Buffer): string => buf.toString('base64url');
const fromB64 = (s: string): Buffer => Buffer.from(s, 'base64url');

function parseKey(value: string, label: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error(`${label} must be 32 bytes (base64-encoded)`);
  return key;
}

export function loadEncryptionConfig(env: NodeJS.ProcessEnv = process.env): EncryptionKeyConfig {
  const activeKeyId = env.ENCRYPTION_KEY_ID || 'k1';
  const keys: Record<string, Buffer> = {};
  if (env.ENCRYPTION_KEY) keys[activeKeyId] = parseKey(env.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
  for (const entry of (env.ENCRYPTION_OLD_KEYS ?? '').split(',').filter(Boolean)) {
    const [id, value] = entry.split(':');
    if (!id || !value) throw new Error('ENCRYPTION_OLD_KEYS must look like "id:base64,id:base64"');
    keys[id] = parseKey(value, `ENCRYPTION_OLD_KEYS[${id}]`);
  }
  const indexKey = env.ENCRYPTION_INDEX_KEY
    ? Buffer.from(env.ENCRYPTION_INDEX_KEY, 'base64')
    : Buffer.alloc(0);
  return { activeKeyId, keys, indexKey };
}

@Injectable()
export class FieldEncryptionService {
  constructor(private readonly config: EncryptionKeyConfig = loadEncryptionConfig()) {}

  private activeKey(): Buffer {
    const key = this.config.keys[this.config.activeKeyId];
    if (!key) throw new Error('ENCRYPTION_KEY is not configured');
    return key;
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(`${PREFIX}:`);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.activeKey(), iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [PREFIX, this.config.activeKeyId, b64(iv), b64(tag), b64(data)].join(':');
  }

  decrypt(value: string): string {
    const [version, keyId, iv, tag, data] = value.split(':');
    if (version !== PREFIX || !keyId || !iv || !tag || data === undefined) {
      throw new Error('Not an encrypted value');
    }
    const key = this.config.keys[keyId];
    if (!key) throw new Error(`No key available for key id "${keyId}"`);
    const decipher = createDecipheriv('aes-256-gcm', key, fromB64(iv));
    decipher.setAuthTag(fromB64(tag));
    return Buffer.concat([decipher.update(fromB64(data)), decipher.final()]).toString('utf8');
  }

  /** Re-encrypts a value under the active key (used after rotating keys). */
  rotate(value: string): string {
    return this.encrypt(this.decrypt(value));
  }

  /** Deterministic, keyed hash for exact-match search on an encrypted column. */
  blindIndex(value: string): string {
    if (this.config.indexKey.length < 32) {
      throw new Error('ENCRYPTION_INDEX_KEY must be at least 32 bytes (base64-encoded)');
    }
    return createHmac('sha256', this.config.indexKey)
      .update(value.trim().toLowerCase())
      .digest('hex');
  }
}
