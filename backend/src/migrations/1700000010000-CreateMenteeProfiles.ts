import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMenteeProfiles1700000010000 implements MigrationInterface {
  name = 'CreateMenteeProfiles1700000010000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "mentee_profiles_skill_level_enum" AS ENUM ('beginner','intermediate','advanced')`);
    await q.query(`
      CREATE TABLE "mentee_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "learning_goals" text array NOT NULL DEFAULT '{}',
        "areas_of_interest" text array NOT NULL DEFAULT '{}',
        "skill_level" "mentee_profiles_skill_level_enum" NOT NULL DEFAULT 'beginner',
        "preferred_mentoring_style" text array NOT NULL DEFAULT '{}',
        "time_commitment_hours" integer NOT NULL DEFAULT 0,
        "professional_background" text,
        "job_title" character varying(120),
        "industry" character varying(120),
        "portfolio_links" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mentee_profiles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mentee_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_mentee_profiles_user_id" ON "mentee_profiles" ("user_id")`);
    await q.query(`CREATE INDEX "IDX_mentee_profiles_skill_level" ON "mentee_profiles" ("skill_level")`);
    await q.query(`CREATE INDEX "IDX_mentee_profiles_learning_goals" ON "mentee_profiles" USING GIN ("learning_goals")`);
    await q.query(
      `CREATE INDEX "IDX_mentee_profiles_areas_of_interest" ON "mentee_profiles" USING GIN ("areas_of_interest")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "mentee_profiles"`);
    await q.query(`DROP TYPE "mentee_profiles_skill_level_enum"`);
  }
}
