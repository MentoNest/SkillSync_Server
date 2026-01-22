import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSkillsTable1769059634883 implements MigrationInterface {
  name = 'CreateSkillsTable1769059634883';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "skills" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "name" character varying(255) NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_skills_id" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_skills_name" UNIQUE ("name")
        )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "skills"`);
  }
}
