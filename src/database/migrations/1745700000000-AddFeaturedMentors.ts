import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddFeaturedMentors1745700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add featured-related columns to mentor_profiles
    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'isFeatured',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'featuredAt',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'featuredExpiresAt',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'featuredOrder',
        type: 'integer',
        default: 0,
      }),
    );

    // Create indices for performance
    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({
        name: 'IDX_mentor_profiles_isFeatured_featuredOrder',
        columnNames: ['isFeatured', 'featuredOrder'],
      }),
    );

    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({
        name: 'IDX_mentor_profiles_isFeatured_featuredAt',
        columnNames: ['isFeatured', 'featuredAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indices
    await queryRunner.dropIndex(
      'mentor_profiles',
      'IDX_mentor_profiles_isFeatured_featuredOrder',
    );

    await queryRunner.dropIndex(
      'mentor_profiles',
      'IDX_mentor_profiles_isFeatured_featuredAt',
    );

    // Drop columns
    await queryRunner.dropColumn('mentor_profiles', 'featuredOrder');
    await queryRunner.dropColumn('mentor_profiles', 'featuredExpiresAt');
    await queryRunner.dropColumn('mentor_profiles', 'featuredAt');
    await queryRunner.dropColumn('mentor_profiles', 'isFeatured');
  }
}
