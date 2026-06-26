import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1750300000000
  implements MigrationInterface
{
  name = 'CreateNotificationsTable1750300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"    UUID         NOT NULL,
        "type"       VARCHAR(50)  NOT NULL,
        "title"      VARCHAR(255) NOT NULL,
        "body"       TEXT         NOT NULL,
        "data"       JSONB,
        "is_read"    BOOLEAN      NOT NULL DEFAULT FALSE,
        "read_at"    TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_user_created"
        ON "notifications" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_user_unread"
        ON "notifications" ("user_id", "is_read")
        WHERE is_read = FALSE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notifications_user_unread"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notifications_user_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
