import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateListingSkillsTable16769059634885 implements MigrationInterface {
  name = 'CreateListingSkillsTable16769059634885';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "listing_skills" (
            "listing_id" uuid NOT NULL,
            "skill_id" uuid NOT NULL,
            CONSTRAINT "PK_listing_skills" PRIMARY KEY ("listing_id", "skill_id"),
            CONSTRAINT "FK_listing_skills_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_listing_skills_skill" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE
        )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_listing_skills_listing_id" ON "listing_skills" ("listing_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_listing_skills_skill_id" ON "listing_skills" ("skill_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_listing_skills_skill_id"`);
    await queryRunner.query(`DROP INDEX "IDX_listing_skills_listing_id"`);
    await queryRunner.query(`DROP TABLE "listing_skills"`);
  }
}
