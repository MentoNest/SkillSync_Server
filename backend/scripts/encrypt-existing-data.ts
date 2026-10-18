/**
 * Encrypts existing plaintext values in place (issue #1481) and fills the
 * blind-index column. Idempotent: rows already encrypted are skipped.
 *
 *   npm run encrypt:backfill -- <table> <column> [indexColumn]
 *
 * Example:
 *   npm run encrypt:backfill -- mentor_profiles contact_email contact_email_hash
 *
 * Take a backup first (docs/BACKUP_AND_RESTORE.md).
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/config/database.config';
import {
  FieldEncryptionService,
  loadEncryptionConfig,
} from '../src/security/encryption/field-encryption.service';

const IDENT = /^[a-z_][a-z0-9_]*$/i;
const BATCH = 500;

async function main(): Promise<void> {
  const [table, column, indexColumn] = process.argv.slice(2);
  if (!table || !column || ![table, column, indexColumn ?? 'x'].every((v) => IDENT.test(v))) {
    console.error('Usage: encrypt-existing-data <table> <column> [indexColumn]');
    process.exit(2);
  }

  const encryption = new FieldEncryptionService(loadEncryptionConfig());
  const ds = await new DataSource(buildDataSourceOptions(process.env)).initialize();
  let done = 0;

  try {
    for (;;) {
      const rows: { id: string; value: string }[] = await ds.query(
        `SELECT "id", "${column}" AS value FROM "${table}"
         WHERE "${column}" IS NOT NULL AND "${column}" NOT LIKE 'v1:%'
         ORDER BY "id" LIMIT ${BATCH}`,
      );
      if (rows.length === 0) break;
      await ds.transaction(async (tx) => {
        for (const row of rows) {
          const encrypted = encryption.encrypt(row.value);
          if (indexColumn) {
            await tx.query(`UPDATE "${table}" SET "${column}" = $1, "${indexColumn}" = $2 WHERE "id" = $3`, [
              encrypted,
              encryption.blindIndex(row.value),
              row.id,
            ]);
          } else {
            await tx.query(`UPDATE "${table}" SET "${column}" = $1 WHERE "id" = $2`, [encrypted, row.id]);
          }
        }
      });
      done += rows.length;
      console.log(`Encrypted ${done} rows...`);
    }
    console.log(`Done: ${done} rows encrypted in ${table}.${column}.`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
