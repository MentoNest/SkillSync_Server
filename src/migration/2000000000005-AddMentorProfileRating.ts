import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMentorProfileRating2000000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add averageRating column to mentor_profiles table
    await queryRunner.query(`
      ALTER TABLE mentor_profiles 
      ADD COLUMN averageRating DECIMAL(3,2) DEFAULT 0.00
    `);

    // Create index for the new column
    await queryRunner.query(`
      CREATE INDEX "IDX_MENTOR_PROFILE_AVERAGE_RATING" 
      ON "mentor_profiles" ("averageRating")
    `);

    // Update existing mentor profiles with average rating from their service listings
    await queryRunner.query(`
      UPDATE mentor_profiles 
      SET averageRating = COALESCE(
        (SELECT CAST(AVG(averageRating) AS DECIMAL(3,2)) 
         FROM service_listings 
         WHERE mentorId = mentor_profiles.userId 
         AND isActive = true 
         AND approvalStatus = 'approved'
         AND isDeleted = false), 0.00)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the index first
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MENTOR_PROFILE_AVERAGE_RATING"`);

    // Drop the column
    await queryRunner.query(`ALTER TABLE mentor_profiles DROP COLUMN averageRating`);
  }
}
