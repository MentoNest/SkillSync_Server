import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddForeignKeyIndexes2000000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // User table indexes
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_USER_ROLE_STATUS_CREATED',
        columnNames: ['role', 'isActive', 'createdAt'],
        isUnique: false,
      })
    );

    // Wallet table indexes
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
        name: 'IDX_WALLET_USER_ID',
        columnNames: ['userId'],
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

    // Mentor Profile indexes
    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({
        name: 'IDX_MENTOR_PROFILE_USER_ID',
        columnNames: ['userId'],
        isUnique: true,
      })
    );

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

    // Mentor Availability indexes
    await queryRunner.createIndex(
      'mentor_availability',
      new TableIndex({
        name: 'IDX_MENTOR_AVAILABILITY_MENTOR_DAY',
        columnNames: ['mentorId', 'dayOfWeek'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'mentor_availability',
      new TableIndex({
        name: 'IDX_MENTOR_AVAILABILITY_MENTOR_ID',
        columnNames: ['mentorId'],
        isUnique: false,
      })
    );

    // Service Listing indexes
    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_MENTOR_ID',
        columnNames: ['mentorId'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_STATUS_ACTIVE',
        columnNames: ['isActive', 'isDraft', 'approvalStatus'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_CATEGORY_STATUS',
        columnNames: ['category', 'isActive', 'approvalStatus'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_RATING',
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

    await queryRunner.createIndex(
      'service_listings',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_FEATURED',
        columnNames: ['isFeatured', 'isActive'],
        isUnique: false,
      })
    );

    // Bookings indexes
    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_BOOKING_MENTOR_ID',
        columnNames: ['mentorId'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_BOOKING_MENTEE_ID',
        columnNames: ['menteeId'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_BOOKING_SERVICE_LISTING_ID',
        columnNames: ['serviceListingId'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_BOOKING_STATUS',
        columnNames: ['status'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'bookings',
      new TableIndex({
        name: 'IDX_BOOKING_SCHEDULED',
        columnNames: ['scheduledAt'],
        isUnique: false,
      })
    );

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

    // Reviews indexes
    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'IDX_REVIEW_LISTING_ID',
        columnNames: ['listingId'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'IDX_REVIEW_REVIEWER_ID',
        columnNames: ['reviewerId'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'reviews',
      new TableIndex({
        name: 'IDX_REVIEW_RATING',
        columnNames: ['rating'],
        isUnique: false,
      })
    );

    // Mentor Skills indexes
    await queryRunner.createIndex(
      'mentor_skills',
      new TableIndex({
        name: 'IDX_MENTOR_SKILL_MENTOR_ID',
        columnNames: ['mentor_id'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'mentor_skills',
      new TableIndex({
        name: 'IDX_MENTOR_SKILL_SKILL_ID',
        columnNames: ['skill_id'],
        isUnique: false,
      })
    );

    // Service Listing Tags junction table indexes
    await queryRunner.createIndex(
      'service_listing_tags',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_TAGS_LISTING_ID',
        columnNames: ['service_listing_id'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'service_listing_tags',
      new TableIndex({
        name: 'IDX_SERVICE_LISTING_TAGS_TAG_ID',
        columnNames: ['tag_id'],
        isUnique: false,
      })
    );

    // Skills indexes
    await queryRunner.createIndex(
      'skills',
      new TableIndex({
        name: 'IDX_SKILL_STATUS',
        columnNames: ['status'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'skills',
      new TableIndex({
        name: 'IDX_SKILL_CATEGORY_ID',
        columnNames: ['categoryId'],
        isUnique: false,
      })
    );

    await queryRunner.createIndex(
      'skills',
      new TableIndex({
        name: 'IDX_SKILL_SLUG',
        columnNames: ['slug'],
        isUnique: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all indexes in reverse order
    const indexes = [
      'IDX_SKILL_SLUG',
      'IDX_SKILL_CATEGORY_ID',
      'IDX_SKILL_STATUS',
      'IDX_SERVICE_LISTING_TAGS_TAG_ID',
      'IDX_SERVICE_LISTING_TAGS_LISTING_ID',
      'IDX_MENTOR_SKILL_SKILL_ID',
      'IDX_MENTOR_SKILL_MENTOR_ID',
      'IDX_REVIEW_RATING',
      'IDX_REVIEW_REVIEWER_ID',
      'IDX_REVIEW_LISTING_ID',
      'IDX_BOOKING_MENTEE_STATUS',
      'IDX_BOOKING_MENTOR_STATUS',
      'IDX_BOOKING_SCHEDULED',
      'IDX_BOOKING_STATUS',
      'IDX_BOOKING_SERVICE_LISTING_ID',
      'IDX_BOOKING_MENTEE_ID',
      'IDX_BOOKING_MENTOR_ID',
      'IDX_SERVICE_LISTING_FEATURED',
      'IDX_SERVICE_LISTING_EXPIRES',
      'IDX_SERVICE_LISTING_RATING',
      'IDX_SERVICE_LISTING_CATEGORY_STATUS',
      'IDX_SERVICE_LISTING_STATUS_ACTIVE',
      'IDX_SERVICE_LISTING_MENTOR_ID',
      'IDX_MENTOR_AVAILABILITY_MENTOR_ID',
      'IDX_MENTOR_AVAILABILITY_MENTOR_DAY',
      'IDX_MENTOR_PROFILE_AVAILABLE',
      'IDX_MENTOR_PROFILE_VERIFIED_RATING',
      'IDX_MENTOR_PROFILE_USER_ID',
      'IDX_WALLET_USER_PRIMARY',
      'IDX_WALLET_USER_ID',
      'IDX_WALLET_ADDRESS',
      'IDX_USER_ROLE_STATUS_CREATED',
      'IDX_USER_WALLET_ADDRESS_STATUS',
    ];

    for (const indexName of indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${indexName}"`);
    }
  }
}
