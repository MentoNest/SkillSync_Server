import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddOptimizedIndexes2000000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // User table indexes for auth and filtering
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_USER_ROLE_STATUS_CREATED',
        columnNames: ['role', 'isActive', 'createdAt'],
        isUnique: false,
      })
    );

    // Wallet table indexes - wallet address is frequently queried for auth
    await queryRunner.createIndex(
      'wallets',
      new TableIndex({
        name: 'IDX_WALLET_ADDRESS',
        columnNames: ['address'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'wallets',
      new TableIndex({
        name: 'IDX_WALLET_USER_PRIMARY',
        columnNames: ['userId', 'isPrimary'],
        isUnique: false,
      })
    );

    // Mentor Profile indexes for discovery
    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({
        name: 'IDX_MENTOR_PROFILE_VERIFIED_RATING',
        columnNames: ['isVerified', 'averageRating'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({
        name: 'IDX_MENTOR_PROFILE_AVAILABLE',
        columnNames: ['isAvailable'],
        isUnique: false,
      })
    );

    // Mentor Availability indexes for availability checks
    await queryRunner.createIndex(
      'mentor_availability',
      new TableIndex({
        name: 'IDX_MENTOR_AVAILABILITY_MENTOR_DAY',
        columnNames: ['mentorId', 'dayOfWeek'],
        isUnique: false,
      })
    );

    // Service Listing indexes for search and filtering
    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_MENTOR_STATUS',
        columnNames: ['mentorId', 'isActive', 'approvalStatus'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_CATEGORY_FEATURED',
        columnNames: ['category', 'isFeatured', 'isActive'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_RATING_COUNT',
        columnNames: ['averageRating', 'reviewCount'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_EXPIRES',
        columnNames: ['expiresAt'],
        isUnique: false,
      })
    );

    // Bookings indexes for status and user queries
    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_BOOKING_MENTOR_STATUS',
        columnNames: ['mentorId', 'status'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_BOOKING_MENTEE_STATUS',
        columnNames: ['menteeId', 'status'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_BOOKING_SCHEDULED_STATUS',
        columnNames: ['scheduledAt', 'status'],
        isUnique: false,
      })
    );

    // Reviews indexes for listing queries
    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'IDX_REVIEW_LISTING_RATING',
        columnNames: ['listingId', 'rating'],
        isUnique: false,
      })
    );

    // Skills indexes for status and category filtering
    await queryRunner.createIndex(
      'skills',
      new TableIndex({
        name: 'IDX_SKILL_STATUS_CATEGORY',
        columnNames: ['status', 'categoryId'],
        isUnique: false,
      })
    );

    // Junction table indexes for many-to-many relationships
    await queryRunner.createIndex(
      'service_listing_tags',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_TAGS_COMPOSITE',
        columnNames: ['service_listing_id', 'tag_id'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'mentor_skills',
      new TableIndex({
        name: 'IDX_MENTOR_SKILLS_COMPOSITE',
        columnNames: ['mentor_id', 'skill_id'],
        isUnique: false,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      'IDX_MENTOR_SKILLS_COMPOSITE',
      'IDX_SERVICE_LISTING_TAGS_COMPOSITE',
      'IDX_SKILL_STATUS_CATEGORY',
      'IDX_REVIEW_LISTING_RATING',
      'IDX_BOOKING_SCHEDULED_STATUS',
      'IDX_BOOKING_MENTEE_STATUS',
      'IDX_BOOKING_MENTOR_STATUS',
      'IDX_SERVICE_LISTING_EXPIRES',
      'IDX_SERVICE_LISTING_RATING_COUNT',
      'IDX_SERVICE_LISTING_CATEGORY_FEATURED',
      'IDX_SERVICE_LISTING_MENTOR_STATUS',
      'IDX_MENTOR_AVAILABILITY_MENTOR_DAY',
      'IDX_MENTOR_PROFILE_AVAILABLE',
      'IDX_MENTOR_PROFILE_VERIFIED_RATING',
      'IDX_WALLET_USER_PRIMARY',
      'IDX_WALLET_ADDRESS',
      'IDX_USER_ROLE_STATUS_CREATED',
    ];

    for (const indexName of indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${indexName}"`);
    }
  }
}
