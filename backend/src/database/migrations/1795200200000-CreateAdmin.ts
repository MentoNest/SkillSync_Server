import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdmin1795200200000 implements MigrationInterface {
  name = 'CreateAdmin1795200200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS content_reports (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id     VARCHAR(56)   NOT NULL,
        target_type     VARCHAR(50)   NOT NULL,
        target_id       VARCHAR(100)  NOT NULL,
        reason          VARCHAR(1000) NOT NULL,
        status          VARCHAR(24)   NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'resolved', 'dismissed')),
        resolved_by     VARCHAR(56)   NULL,
        resolution_note VARCHAR(1000) NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        resolved_at     TIMESTAMPTZ   NULL,
        deleted_at      TIMESTAMPTZ   NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
        ON content_reports (status, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_content_reports_reporter_created
        ON content_reports (reporter_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_content_reports_target
        ON content_reports (target_type, target_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_content_reports_deleted_at
        ON content_reports (deleted_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        event          VARCHAR(64)   NOT NULL,
        wallet_address VARCHAR(56)   NULL,
        target_id      VARCHAR(100)  NULL,
        ip_address     VARCHAR(64)   NULL,
        user_agent     VARCHAR(255)  NULL,
        metadata       JSONB         NOT NULL DEFAULT '{}'::jsonb,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created
        ON audit_logs (event, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_wallet_created
        ON audit_logs (wallet_address, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created
        ON audit_logs (target_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
        ON audit_logs (created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_logs_created_at');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_audit_logs_target_created',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_audit_logs_wallet_created',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_audit_logs_event_created',
    );
    await queryRunner.query('DROP TABLE IF EXISTS audit_logs');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_content_reports_deleted_at',
    );
    await queryRunner.query('DROP INDEX IF EXISTS idx_content_reports_target');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_content_reports_reporter_created',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_content_reports_status_created',
    );
    await queryRunner.query('DROP TABLE IF EXISTS content_reports');
  }
}
