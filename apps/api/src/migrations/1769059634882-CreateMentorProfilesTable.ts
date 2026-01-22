import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMentorProfilesTable1769059634882 implements MigrationInterface {
  name = 'CreateMentorProfilesTable1769059634882';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "mentor_profiles" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "name" character varying(255) NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_mentor_profiles_id" PRIMARY KEY ("id")
        )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mentor_profiles"`);
  }
}
