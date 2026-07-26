import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokens1722000000000 implements MigrationInterface {
  name = 'CreateRefreshTokens1722000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "tokenHash" varchar(128) NOT NULL,
        "userAgent" varchar(512),
        "ipAddress" varchar(64),
        "expiresAt" TIMESTAMP NOT NULL,
        "revokedAt" TIMESTAMP,
        "replacedByTokenHash" varchar(128),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
