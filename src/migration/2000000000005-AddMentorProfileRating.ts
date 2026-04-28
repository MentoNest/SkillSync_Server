import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddMentorProfileRating2000000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create a functional index for mentor discovery without adding a column
    // This index will be used for queries that filter by isVerified and join with service listings for ratings
    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({
        name: 'IDX_MENTOR_PROFILE_VERIFIED_AVAILABLE',
        columnNames: ['isVerified', 'isAvailable'],
        isUnique: false,
      })
    );

    // Create index on service listings for mentor rating calculations
    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_MENTOR_RATING',
        columnNames: ['mentorId', 'averageRating', 'isActive', 'approvalStatus'],
        isUnique: false,
      })
    );

    // Create a view for mentor profiles with calculated average ratings
    await queryRunner.query(`
      CREATE OR REPLACE VIEW mentor_profiles_with_ratings AS
      SELECT 
        mp.*,
        COALESCE(
          (SELECT CAST(AVG(sl.averageRating) AS DECIMAL(3,2)) 
           FROM service_listings sl 
           WHERE sl.mentorId = mp.userId 
           AND sl.isActive = true 
           AND sl.approvalStatus = 'approved'
           AND sl.isDeleted = false), 0.00) as calculatedAverageRating
      FROM mentor_profiles mp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the view
    await queryRunner.query(`DROP VIEW IF EXISTS mentor_profiles_with_ratings`);

    // Drop the indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_SERVICE_LISTING_MENTOR_RATING"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MENTOR_PROFILE_VERIFIED_AVAILABLE"`);
  }
}
