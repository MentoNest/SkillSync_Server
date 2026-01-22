import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMentorProfilesTable1769059635000 implements MigrationInterface {
  name = 'CreateMentorProfilesTable1769059635000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mentor_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "bio" text,
        "title" character varying(500),
        "years_of_experience" integer NOT NULL DEFAULT 0,
        "is_available" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_mentor_profiles_user_id" UNIQUE ("user_id"),
        CONSTRAINT "PK_mentor_profiles" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "mentor_profiles" 
      ADD CONSTRAINT "FK_mentor_profiles_user_id" 
      FOREIGN KEY ("user_id") 
      REFERENCES "users"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mentor_profiles" 
      DROP CONSTRAINT "FK_mentor_profiles_user_id"
    `);

    await queryRunner.query(`DROP TABLE "mentor_profiles"`);
  }
}
