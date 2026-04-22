import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddListingAuditEvents2200000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "audit_logs_eventtype_enum" ADD VALUE 'listing_created';
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "audit_logs_eventtype_enum" ADD VALUE 'listing_updated';
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "audit_logs_eventtype_enum" ADD VALUE 'listing_deleted';
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  // PostgreSQL enum values cannot be safely removed in-place across versions.
  public async down(_: QueryRunner): Promise<void> {}
}
