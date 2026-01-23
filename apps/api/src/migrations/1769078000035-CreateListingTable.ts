import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateListingTable1769078000035 implements MigrationInterface {
  name = 'CreateListingTable1769078000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "skills" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "category" character varying(50), "description" text, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_81f05095507fd84aa2769b4a522" UNIQUE ("name"), CONSTRAINT "PK_0d3212120f4ecedf90864d7e298" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_81f05095507fd84aa2769b4a52" ON "skills" ("name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "listings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "mentor_profile_id" uuid NOT NULL, "title" character varying(120) NOT NULL, "description" text NOT NULL, "hourly_rate_minor_units" integer NOT NULL, "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_520ecac6c99ec90bcf5a603cdcb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_496b5a6b1fe590224360efa1c8" ON "listings" ("hourly_rate_minor_units") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d07d4860e2ee1fcb222a1a6206" ON "listings" ("active") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_124a412fff1fe8ad1a39d66485" ON "listings" ("mentor_profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "mentor_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "bio" text, "title" character varying(255), "yearsOfExperience" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5fa86c14c3a0de91f7253a180bb" UNIQUE ("user_id"), CONSTRAINT "REL_5fa86c14c3a0de91f7253a180b" UNIQUE ("user_id"), CONSTRAINT "PK_e903fcb76451c2b21ce24565683" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5fa86c14c3a0de91f7253a180b" ON "mentor_profiles" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "listing_skills" ("listing_id" uuid NOT NULL, "skill_id" uuid NOT NULL, CONSTRAINT "PK_bdbcb79fedf7096207c3a5d0d05" PRIMARY KEY ("listing_id", "skill_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0ca83c168e42e38e3702af7b70" ON "listing_skills" ("listing_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c21dd5ef364da39abdfb32b0ef" ON "listing_skills" ("skill_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "FK_124a412fff1fe8ad1a39d664854" FOREIGN KEY ("mentor_profile_id") REFERENCES "mentor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mentor_profiles" ADD CONSTRAINT "FK_5fa86c14c3a0de91f7253a180bb" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_skills" ADD CONSTRAINT "FK_0ca83c168e42e38e3702af7b706" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_skills" ADD CONSTRAINT "FK_c21dd5ef364da39abdfb32b0efb" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "listing_skills" DROP CONSTRAINT "FK_c21dd5ef364da39abdfb32b0efb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_skills" DROP CONSTRAINT "FK_0ca83c168e42e38e3702af7b706"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mentor_profiles" DROP CONSTRAINT "FK_5fa86c14c3a0de91f7253a180bb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP CONSTRAINT "FK_124a412fff1fe8ad1a39d664854"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c21dd5ef364da39abdfb32b0ef"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0ca83c168e42e38e3702af7b70"`,
    );
    await queryRunner.query(`DROP TABLE "listing_skills"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5fa86c14c3a0de91f7253a180b"`,
    );
    await queryRunner.query(`DROP TABLE "mentor_profiles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_124a412fff1fe8ad1a39d66485"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d07d4860e2ee1fcb222a1a6206"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_496b5a6b1fe590224360efa1c8"`,
    );
    await queryRunner.query(`DROP TABLE "listings"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_81f05095507fd84aa2769b4a52"`,
    );
    await queryRunner.query(`DROP TABLE "skills"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
