import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfileTables1721900000000 implements MigrationInterface {
  name = 'CreateProfileTables1721900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user status enum
    await queryRunner.query(`
      CREATE TYPE "user_status_enum" AS ENUM ('active', 'suspended', 'deleted')
    `);

    // Create auth role enum
    await queryRunner.query(`
      CREATE TYPE "auth_role_enum" AS ENUM ('user', 'mentor', 'mentee', 'admin')
    `);

    // Create skill level enum
    await queryRunner.query(`
      CREATE TYPE "skill_level_enum" AS ENUM ('beginner', 'intermediate', 'advanced')
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "walletAddress" varchar(256) NOT NULL,
        "username" varchar,
        "displayName" varchar,
        "status" "user_status_enum" NOT NULL DEFAULT 'active',
        "tokenVersion" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // Create roles table
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" "auth_role_enum" NOT NULL,
        "userId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_roles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create mentor_profiles table
    await queryRunner.query(`
      CREATE TABLE "mentor_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "bio" text,
        "skills" text NOT NULL DEFAULT '',
        "hourlyRate" decimal(10,2) NOT NULL DEFAULT 0,
        "expertiseAreas" text NOT NULL DEFAULT '',
        "yearsOfExperience" integer NOT NULL DEFAULT 0,
        "currentRole" varchar,
        "company" varchar,
        "education" jsonb,
        "certifications" jsonb,
        "languages" text NOT NULL DEFAULT '',
        "mentoringStyleDescription" text,
        "isVerified" boolean NOT NULL DEFAULT false,
        "totalMentoringHours" integer NOT NULL DEFAULT 0,
        "averageRating" decimal(3,2) NOT NULL DEFAULT 0,
        "numberOfReviews" integer NOT NULL DEFAULT 0,
        "profileVersion" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mentor_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_mentor_profiles_userId" UNIQUE ("userId"),
        CONSTRAINT "FK_mentor_profiles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create mentee_profiles table
    await queryRunner.query(`
      CREATE TABLE "mentee_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "learningGoals" text[] NOT NULL DEFAULT '{}',
        "areasOfInterest" text NOT NULL DEFAULT '',
        "currentSkillLevel" "skill_level_enum" NOT NULL DEFAULT 'beginner',
        "preferredMentoringStyle" text NOT NULL DEFAULT '',
        "timeCommitmentHoursPerWeek" integer NOT NULL DEFAULT 0,
        "professionalBackground" text,
        "jobTitle" varchar,
        "industry" varchar,
        "portfolioLinks" text NOT NULL DEFAULT '',
        "profileVersion" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mentee_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_mentee_profiles_userId" UNIQUE ("userId"),
        CONSTRAINT "FK_mentee_profiles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for mentor_profiles search
    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_profiles_skills" ON "mentor_profiles" ("skills")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_profiles_hourlyRate" ON "mentor_profiles" ("hourlyRate")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mentor_profiles_averageRating" ON "mentor_profiles" ("averageRating")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mentee_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mentor_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skill_level_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "auth_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_status_enum"`);
  }
}
