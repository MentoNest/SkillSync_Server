import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserBehaviorTable2100000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for behavior_type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_behavior_behaviortype_enum" AS ENUM ('view', 'click', 'bookmark', 'booking', 'review', 'wishlist_add', 'wishlist_remove');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create user_behavior table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_behavior" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "listingId" uuid NOT NULL,
        "behaviorType" "user_behavior_behaviortype_enum" NOT NULL,
        "metadata" text,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        FOREIGN KEY ("listingId") REFERENCES "service_listings"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for efficient queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_behavior_userId_listingId_behaviorType"
      ON "user_behavior" ("userId", "listingId", "behaviorType")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_behavior_userId_createdAt"
      ON "user_behavior" ("userId", "createdAt" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_behavior_listingId_behaviorType"
      ON "user_behavior" ("listingId", "behaviorType")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_user_behavior_listingId_behaviorType"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_user_behavior_userId_createdAt"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_user_behavior_userId_listingId_behaviorType"
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "user_behavior"
    `);

    // Drop enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "user_behavior_behaviortype_enum"
    `);
  }
}
