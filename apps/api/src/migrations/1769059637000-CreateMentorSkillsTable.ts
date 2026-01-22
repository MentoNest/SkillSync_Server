import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMentorSkillsTable1769059637000 implements MigrationInterface {
  name = 'CreateMentorSkillsTable1769059637000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for skill level
    await queryRunner.query(`
      CREATE TYPE "mentor_skills_level_enum" AS ENUM('beginner', 'intermediate', 'expert')
    `);

    await queryRunner.query(`
      CREATE TABLE "mentor_skills" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentor_profile_id" uuid NOT NULL,
        "skill_id" uuid NOT NULL,
        "level" "mentor_skills_level_enum" NOT NULL DEFAULT 'beginner',
        "years_experience" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_mentor_skills_profile_skill" UNIQUE ("mentor_profile_id", "skill_id"),
        CONSTRAINT "PK_mentor_skills" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_skills_mentor_profile_id" ON "mentor_skills" ("mentor_profile_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_skills_skill_id" ON "mentor_skills" ("skill_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "mentor_skills" 
      ADD CONSTRAINT "FK_mentor_skills_mentor_profile_id" 
      FOREIGN KEY ("mentor_profile_id") 
      REFERENCES "mentor_profiles"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "mentor_skills" 
      ADD CONSTRAINT "FK_mentor_skills_skill_id" 
      FOREIGN KEY ("skill_id") 
      REFERENCES "skills"("id") 
      ON DELETE CASCADE 
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mentor_skills" 
      DROP CONSTRAINT "FK_mentor_skills_skill_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "mentor_skills" 
      DROP CONSTRAINT "FK_mentor_skills_mentor_profile_id"
    `);

    await queryRunner.query(`DROP INDEX "IDX_mentor_skills_skill_id"`);
    await queryRunner.query(`DROP INDEX "IDX_mentor_skills_mentor_profile_id"`);
    await queryRunner.query(`DROP TABLE "mentor_skills"`);
    await queryRunner.query(`DROP TYPE "mentor_skills_level_enum"`);
  }
}
