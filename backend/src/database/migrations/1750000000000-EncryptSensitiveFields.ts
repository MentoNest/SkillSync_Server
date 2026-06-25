import { MigrationInterface, QueryRunner } from 'typeorm';
import { createCipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function hmacHash(value: string, hmacKey: Buffer): string {
  return createHmac('sha256', hmacKey).update(value, 'utf8').digest('hex');
}

function isAlreadyEncrypted(value: string): boolean {
  return value.split(':').length === 3;
}

/**
 * Migration: EncryptSensitiveFields
 *
 * 1. Widens users.wallet column to VARCHAR(256) to hold ciphertext.
 * 2. Adds users.wallet_hash CHAR(64) column for HMAC-indexed lookups.
 * 3. Encrypts all existing plaintext wallet addresses.
 * 4. Adds a UNIQUE index on wallet_hash.
 *
 * Requires ENCRYPTION_KEY and ENCRYPTION_HMAC_KEY environment variables.
 * Run revert() to undo: decrypts ciphertext back to plaintext and drops wallet_hash.
 */
export class EncryptSensitiveFields1750000000000 implements MigrationInterface {
  name = 'EncryptSensitiveFields1750000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rawKey = process.env.ENCRYPTION_KEY;
    const rawHmac = process.env.ENCRYPTION_HMAC_KEY;

    if (!rawKey || rawKey.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      );
    }
    if (!rawHmac || rawHmac.length !== 64) {
      throw new Error(
        'ENCRYPTION_HMAC_KEY must be a 64-character hex string (32 bytes)',
      );
    }

    const key = Buffer.from(rawKey, 'hex');
    const hmacKey = Buffer.from(rawHmac, 'hex');

    // 1. Widen wallet column to hold encrypted values
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "wallet" TYPE VARCHAR(256)
    `);

    // 2. Add wallet_hash column (nullable first, then set NOT NULL after population)
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "wallet_hash" CHAR(64)
    `);

    // 3. Encrypt existing plaintext wallet addresses row by row
    const rows: { id: string; wallet: string }[] =
      await queryRunner.query(`SELECT id, wallet FROM "users"`);

    for (const row of rows) {
      if (isAlreadyEncrypted(row.wallet)) {
        // Row was already migrated – just ensure hash exists
        continue;
      }
      const encryptedWallet = encrypt(row.wallet, key);
      const walletHash = hmacHash(row.wallet, hmacKey);
      await queryRunner.query(
        `UPDATE "users" SET wallet = $1, wallet_hash = $2 WHERE id = $3`,
        [encryptedWallet, walletHash, row.id],
      );
    }

    // 4. Enforce NOT NULL and UNIQUE on wallet_hash
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "wallet_hash" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_wallet_hash"
        ON "users" ("wallet_hash")
    `);

    // 5. Drop the old unique constraint on wallet (plaintext uniqueness no longer applies)
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_3e3f3c3e3f3c3e3f3c3e3f3c3e"
    `);
    // Drop by column name as fallback
    await queryRunner.query(`
      DO $$
      DECLARE
        cname text;
      BEGIN
        SELECT tc.constraint_name INTO cname
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'users'
          AND tc.constraint_type = 'UNIQUE'
          AND ccu.column_name = 'wallet';
        IF cname IS NOT NULL THEN
          EXECUTE 'ALTER TABLE "users" DROP CONSTRAINT "' || cname || '"';
        END IF;
      END$$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Decryption requires the key – abort if not present
    const rawKey = process.env.ENCRYPTION_KEY;
    const rawHmac = process.env.ENCRYPTION_HMAC_KEY;
    if (!rawKey || !rawHmac) {
      throw new Error(
        'ENCRYPTION_KEY and ENCRYPTION_HMAC_KEY are required to revert this migration',
      );
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_users_wallet_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "wallet_hash"`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "wallet" TYPE VARCHAR(56)
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "UQ_users_wallet" UNIQUE ("wallet")
    `);
  }
}
