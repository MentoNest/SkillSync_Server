import { MigrationInterface, QueryRunner } from 'typeorm';
import { createCipheriv, createHmac, randomBytes, scryptSync } from 'crypto';

export class AddEncryptionToUsers1746000000000 implements MigrationInterface {
  name = 'AddEncryptionToUsers1746000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add emailHash column for searchable encrypted emails
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "emailHash" VARCHAR(64)
    `);

    // Create index on emailHash for fast lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_emailHash" ON "users" ("emailHash")
    `);

    // Check if there's existing data to encrypt
    const usersResult = await queryRunner.query(`
      SELECT id, email, timezone, locale 
      FROM "users" 
      WHERE email IS NOT NULL OR timezone IS NOT NULL OR locale IS NOT NULL
    `);

    if (usersResult.length === 0) {
      console.log('No existing data to encrypt');
      return;
    }

    console.log(`Found ${usersResult.length} users with data to encrypt`);

    // Get encryption keys from environment
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const hashKey = process.env.ENCRYPTION_HASH_KEY;
    const salt = process.env.ENCRYPTION_SALT || 'default-salt-change-in-production';
    const hashSalt = process.env.ENCRYPTION_HASH_SALT || 'default-hash-salt-change-in-production';

    if (!encryptionKey || !hashKey) {
      console.warn('⚠️  ENCRYPTION_KEY or ENCRYPTION_HASH_KEY not set - skipping data encryption');
      console.warn('   Please set these environment variables and run the migration again');
      return;
    }

    // Derive encryption key
    const derivedKey = scryptSync(encryptionKey, salt, 32);
    const derivedHashKey = scryptSync(hashKey, hashSalt, 32);

    const algorithm = 'aes-256-gcm';
    const ivLength = 16;

    // Encrypt existing data
    let encryptedCount = 0;
    for (const user of usersResult) {
      try {
        const updates: any = {};

        // Encrypt email and create hash
        if (user.email) {
          const iv = randomBytes(ivLength);
          const cipher = createCipheriv(algorithm, derivedKey, iv);
          
          let ciphertext = cipher.update(user.email, 'utf8', 'base64');
          ciphertext += cipher.final('base64');
          
          const authTag = cipher.getAuthTag();
          const encryptedEmail = `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
          
          updates.email = encryptedEmail;
          
          // Create deterministic hash for email
          const hmac = createHmac('sha256', derivedHashKey);
          hmac.update(user.email.toLowerCase().trim());
          updates['emailHash'] = hmac.digest('hex');
        }

        // Encrypt timezone
        if (user.timezone) {
          const iv = randomBytes(ivLength);
          const cipher = createCipheriv(algorithm, derivedKey, iv);
          
          let ciphertext = cipher.update(user.timezone, 'utf8', 'base64');
          ciphertext += cipher.final('base64');
          
          const authTag = cipher.getAuthTag();
          updates.timezone = `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
        }

        // Encrypt locale
        if (user.locale) {
          const iv = randomBytes(ivLength);
          const cipher = createCipheriv(algorithm, derivedKey, iv);
          
          let ciphertext = cipher.update(user.locale, 'utf8', 'base64');
          ciphertext += cipher.final('base64');
          
          const authTag = cipher.getAuthTag();
          updates.locale = `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
        }

        // Update user record
        if (Object.keys(updates).length > 0) {
          const setClauses = Object.keys(updates)
            .map((key, idx) => `"${key}" = $${idx + 1}`)
            .join(', ');
          
          const values = Object.values(updates);
          
          await queryRunner.query(
            `UPDATE "users" SET ${setClauses} WHERE "id" = $${values.length + 1}`,
            [...values, user.id]
          );
          
          encryptedCount++;
        }
      } catch (error) {
        console.error(`Failed to encrypt user ${user.id}:`, error.message);
      }
    }

    console.log(`✅ Successfully encrypted ${encryptedCount}/${usersResult.length} users`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: This is irreversible - we cannot decrypt without the keys
    // We'll just drop the emailHash column
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_emailHash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailHash"`);
    
    console.warn('⚠️  WARNING: Encrypted data cannot be automatically decrypted by this migration');
    console.warn('   You will need to restore from backup if you need plaintext data');
  }
}
