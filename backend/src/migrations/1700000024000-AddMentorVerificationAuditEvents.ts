import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMentorVerificationAuditEvents1700000024000 implements MigrationInterface {
  name = 'AddMentorVerificationAuditEvents1700000024000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_event_enum') THEN
          ALTER TYPE "audit_logs_event_enum" ADD VALUE IF NOT EXISTS 'mentor_verified';
          ALTER TYPE "audit_logs_event_enum" ADD VALUE IF NOT EXISTS 'mentor_verification_revoked';
          ALTER TYPE "audit_logs_event_enum" ADD VALUE IF NOT EXISTS 'mentor_verification_requested';
        END IF;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Postgres does not support removing enum values; nothing to revert safely.
  }
}
