import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * #1320: align the `audit_logs` table with the canonical AuditLog entity.
 *
 * The table was originally created with generic `action`/`entityType`/
 * `entityId` columns; authentication auditing needs a typed `eventType`, the
 * wallet/IP/user-agent triple and an indexed `timestamp` instead. Indexes cover
 * the three access patterns: by user, by event type and by date range
 * (retention sweeps included).
 */
export class AlignAuditLogsTable1725000000011 implements MigrationInterface {
  name = 'AlignAuditLogsTable1725000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('audit_logs');
    if (!table) {
      throw new Error('audit_logs table is missing - run the earlier migrations first');
    }

    const existingColumns = new Set(table.columns.map((column) => column.name));

    // 1. userId must be nullable: audit events can be raised for a wallet that
    //    never resolved to an account (failed login of an unknown address).
    await queryRunner.query('ALTER TABLE "audit_logs" ALTER COLUMN "userId" DROP NOT NULL');

    // 2. createdAt -> timestamp (timestamptz), the column the retention sweep
    //    and the admin filters order by.
    if (existingColumns.has('createdAt')) {
      await queryRunner.query(
        'ALTER TABLE "audit_logs" RENAME COLUMN "createdAt" TO "timestamp"',
      );
    }
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "timestamp" TYPE timestamptz USING "timestamp" AT TIME ZONE \'UTC\'',
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "timestamp" SET DEFAULT now()',
    );

    // 3. Authentication specific columns.
    if (!existingColumns.has('eventType')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "eventType" varchar(100)`,
      );
    }
    if (!existingColumns.has('walletAddress')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "walletAddress" varchar(56)`,
      );
    }
    if (!existingColumns.has('ipAddress')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "ipAddress" varchar(45)`,
      );
    }
    if (!existingColumns.has('userAgent')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "userAgent" varchar(500)`,
      );
    }
    if (!existingColumns.has('isSuspicious')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "isSuspicious" boolean NOT NULL DEFAULT false`,
      );
    }
    if (!existingColumns.has('suspiciousReason')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "suspiciousReason" text`,
      );
    }
    if (!existingColumns.has('geoCountry')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "geoCountry" varchar(100)`,
      );
    }
    if (!existingColumns.has('geoCity')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "geoCity" varchar(100)`,
      );
    }
    if (!existingColumns.has('geoLat')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "geoLat" double precision`,
      );
    }
    if (!existingColumns.has('geoLon')) {
      await queryRunner.query(
        `ALTER TABLE "audit_logs" ADD COLUMN "geoLon" double precision`,
      );
    }

    // 4. `details` is always an object, never NULL.
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "details" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `UPDATE "audit_logs" SET "details" = '{}'::jsonb WHERE "details" IS NULL`,
    );

    // 5. Backfill eventType for rows written before this migration.
    await queryRunner.query(
      `UPDATE "audit_logs" SET "eventType" = 'UNKNOWN' WHERE "eventType" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "eventType" SET NOT NULL`,
    );

    // 6. Drop the columns that the canonical entity no longer maps.
    for (const column of ['action', 'entityType', 'entityId']) {
      if (existingColumns.has(column)) {
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "${column}"`);
      }
    }

    // 7. Replace the old indexes with the ones the entity declares.
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_action');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_createdAt');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_userId');

    await queryRunner.createIndices('audit_logs', [
      new TableIndex({ name: 'IDX_audit_logs_userId', columnNames: ['userId'] }),
      new TableIndex({ name: 'IDX_audit_logs_eventType', columnNames: ['eventType'] }),
      new TableIndex({ name: 'IDX_audit_logs_timestamp', columnNames: ['timestamp'] }),
      new TableIndex({ name: 'IDX_audit_logs_isSuspicious', columnNames: ['isSuspicious'] }),
      new TableIndex({ name: 'IDX_audit_logs_walletAddress', columnNames: ['walletAddress'] }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_walletAddress');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_isSuspicious');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_timestamp');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_eventType');

    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "action" varchar`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "entityType" varchar`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN "entityId" varchar`);
    await queryRunner.query(
      `UPDATE "audit_logs" SET "action" = "eventType" WHERE "eventType" IS NOT NULL`,
    );

    await queryRunner.query(
      'ALTER TABLE "audit_logs" RENAME COLUMN "timestamp" TO "createdAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ALTER COLUMN "createdAt" TYPE timestamp',
    );

    for (const column of [
      'eventType',
      'walletAddress',
      'ipAddress',
      'userAgent',
      'isSuspicious',
      'suspiciousReason',
      'geoCountry',
      'geoCity',
      'geoLat',
      'geoLon',
    ]) {
      await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "${column}"`);
    }

    await queryRunner.createIndices('audit_logs', [
      new TableIndex({ name: 'IDX_audit_logs_action', columnNames: ['action'] }),
      new TableIndex({ name: 'IDX_audit_logs_createdAt', columnNames: ['createdAt'] }),
      new TableIndex({ name: 'IDX_audit_logs_userId', columnNames: ['userId'] }),
    ]);
  }
}
