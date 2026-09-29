import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * #1346: Adds isFeatured (boolean), featuredAt (timestamp) and featuredOrder
 * (integer) to mentor_profiles so admins can surface top mentors on the
 * homepage/discovery sections.
 *
 * - isFeatured: quick filter flag; false by default so existing rows are
 *   unaffected.
 * - featuredAt:  the moment the profile was featured – used to enforce the
 *   configurable auto-expiry (default 30 days).
 * - featuredOrder: lower value = higher position in the featured carousel;
 *   nullable so rows without an explicit order sort last.
 *
 * A composite index on (isFeatured, featuredOrder) mirrors the entity
 * @Index decorator and makes the public GET /mentors/featured query fast.
 */
export class AddFeaturedMentorColumns1725000000013 implements MigrationInterface {
  name = 'AddFeaturedMentorColumns1725000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('mentor_profiles', 'isFeatured'))) {
      await queryRunner.query(
        `ALTER TABLE "mentor_profiles" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT FALSE`,
      );
    }

    if (!(await queryRunner.hasColumn('mentor_profiles', 'featuredAt'))) {
      await queryRunner.query(
        `ALTER TABLE "mentor_profiles" ADD COLUMN "featuredAt" TIMESTAMP NULL`,
      );
    }

    if (!(await queryRunner.hasColumn('mentor_profiles', 'featuredOrder'))) {
      await queryRunner.query(
        `ALTER TABLE "mentor_profiles" ADD COLUMN "featuredOrder" INTEGER NULL`,
      );
    }

    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({
        name: 'IDX_mentor_profiles_isFeatured_featuredOrder',
        columnNames: ['isFeatured', 'featuredOrder'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mentor_profiles_isFeatured_featuredOrder"`,
    );

    if (await queryRunner.hasColumn('mentor_profiles', 'featuredOrder')) {
      await queryRunner.query(
        `ALTER TABLE "mentor_profiles" DROP COLUMN "featuredOrder"`,
      );
    }

    if (await queryRunner.hasColumn('mentor_profiles', 'featuredAt')) {
      await queryRunner.query(
        `ALTER TABLE "mentor_profiles" DROP COLUMN "featuredAt"`,
      );
    }

    if (await queryRunner.hasColumn('mentor_profiles', 'isFeatured')) {
      await queryRunner.query(
        `ALTER TABLE "mentor_profiles" DROP COLUMN "isFeatured"`,
      );
    }
  }
}
