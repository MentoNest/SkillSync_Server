import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileVersionColumns1700000011000 implements MigrationInterface {
  name = 'AddProfileVersionColumns1700000011000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "profile_version" integer NOT NULL DEFAULT 1`);
    await q.query(`ALTER TABLE "mentee_profiles" ADD COLUMN IF NOT EXISTS "profile_version" integer NOT NULL DEFAULT 1`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mentee_profiles" DROP COLUMN IF EXISTS "profile_version"`);
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "profile_version"`);
  }
}
