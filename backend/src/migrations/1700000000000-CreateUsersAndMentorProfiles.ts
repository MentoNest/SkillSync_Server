import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndMentorProfiles1700000000000 implements MigrationInterface {
  name = 'CreateUsersAndMentorProfiles1700000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await q.query(`CREATE TYPE "users_status_enum" AS ENUM ('active','pending','suspended','deleted')`);
    await q.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "walletAddress" character varying(56) NOT NULL,
        "email" character varying(255),
        "displayName" character varying(100),
        "status" "users_status_enum" NOT NULL DEFAULT 'active',
        "tokenVersion" integer NOT NULL DEFAULT 0,
        "avatarUrl" character varying(2048),
        "timezone" character varying(64),
        "locale" character varying(16),
        "lastLoginAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_users_wallet_address" ON "users" ("walletAddress")`);
    await q.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email") WHERE "email" IS NOT NULL`);
    await q.query(`CREATE INDEX "IDX_users_status" ON "users" ("status")`);
    await q.query(`CREATE INDEX "IDX_users_created_at" ON "users" ("createdAt")`);
    await q.query(`CREATE INDEX "IDX_users_last_login_at" ON "users" ("lastLoginAt")`);

    await q.query(`
      CREATE TABLE "mentor_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "bio" character varying(1000),
        "skills" text array NOT NULL DEFAULT '{}',
        "hourly_rate" numeric(8,2) NOT NULL DEFAULT 0,
        "expertise_areas" text array NOT NULL DEFAULT '{}',
        "years_of_experience" integer NOT NULL DEFAULT 0,
        "current_role" character varying(120),
        "company" character varying(120),
        "education" jsonb NOT NULL DEFAULT '[]',
        "certifications" jsonb NOT NULL DEFAULT '[]',
        "languages" text array NOT NULL DEFAULT '{}',
        "mentoring_style" character varying(1000),
        "is_verified" boolean NOT NULL DEFAULT false,
        "total_mentoring_hours" numeric(10,2) NOT NULL DEFAULT 0,
        "average_rating" numeric(3,2) NOT NULL DEFAULT 0,
        "review_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mentor_profiles_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_mentor_profiles_hourly_rate" CHECK ("hourly_rate" >= 0 AND "hourly_rate" <= 1000),
        CONSTRAINT "FK_mentor_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_mentor_profiles_user_id" ON "mentor_profiles" ("user_id")`);
    await q.query(`CREATE INDEX "IDX_mentor_profiles_hourly_rate" ON "mentor_profiles" ("hourly_rate")`);
    await q.query(`CREATE INDEX "IDX_mentor_profiles_average_rating" ON "mentor_profiles" ("average_rating")`);
    await q.query(`CREATE INDEX "IDX_mentor_profiles_skills" ON "mentor_profiles" USING GIN ("skills")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "mentor_profiles"`);
    await q.query(`DROP TABLE "users"`);
    await q.query(`DROP TYPE "users_status_enum"`);
  }
}
