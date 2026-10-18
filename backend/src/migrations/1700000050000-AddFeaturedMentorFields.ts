import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds the featured-mentor spotlight columns and index (#1459). */
export class AddFeaturedMentorFields1700000050000 implements MigrationInterface {
  name = 'AddFeaturedMentorFields1700000050000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "is_featured" BOOLEAN NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "featured_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "mentor_profiles" ADD COLUMN IF NOT EXISTS "featured_order" INTEGER NOT NULL DEFAULT 0`);

    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mentor_profiles_featured_order" ON "mentor_profiles" ("is_featured", "featured_order")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_mentor_profiles_featured_order"`);
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "featured_order"`);
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "featured_at"`);
    await q.query(`ALTER TABLE "mentor_profiles" DROP COLUMN IF EXISTS "is_featured"`);
  }
}