import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSkillsTable1769059636000 implements MigrationInterface {
  name = 'CreateSkillsTable1769059636000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "skills" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "category" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_skills_name" UNIQUE ("name"),
        CONSTRAINT "UQ_skills_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_skills" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_skills_slug" ON "skills" ("slug")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_skills_slug"`);
    await queryRunner.query(`DROP TABLE "skills"`);
  }
}
