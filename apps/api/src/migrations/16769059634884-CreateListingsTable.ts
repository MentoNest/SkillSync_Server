import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateListingsTable16769059634884 implements MigrationInterface {
  name = 'CreateListingsTable16769059634884';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "listings" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "mentor_profile_id" uuid NOT NULL,
            "title" character varying(120) NOT NULL,
            "description" text NOT NULL,
            "hourly_rate_minor_units" integer NOT NULL CHECK ("hourly_rate_minor_units" >= 0),
            "active" boolean NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_listings_id" PRIMARY KEY ("id"),
            CONSTRAINT "FK_listings_mentor_profile" FOREIGN KEY ("mentor_profile_id") REFERENCES "mentor_profiles"("id") ON DELETE CASCADE
        )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_mentor_profile_id" ON "listings" ("mentor_profile_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_active" ON "listings" ("active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_hourly_rate_minor_units" ON "listings" ("hourly_rate_minor_units")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_listings_hourly_rate_minor_units"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_listings_active"`);
    await queryRunner.query(`DROP INDEX "IDX_listings_mentor_profile_id"`);
    await queryRunner.query(`DROP TABLE "listings"`);
  }
}
