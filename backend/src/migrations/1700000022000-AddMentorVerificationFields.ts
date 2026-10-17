import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMentorVerificationFields1700000022000 implements MigrationInterface {
  name = 'AddMentorVerificationFields1700000022000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "verified_by" uuid`);
    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "verification_notes" character varying(1000)`);
    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "verification_method" character varying(32)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "verification_method"`);
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "verification_notes"`);
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "verified_by"`);
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "verified_at"`);
  }
}
