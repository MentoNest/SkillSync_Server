import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPublicProfileFieldsToMentorProfiles1766000000000 implements MigrationInterface {
  name = 'AddPublicProfileFieldsToMentorProfiles1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'hourly_rate',
        type: 'decimal',
        precision: 10,
        scale: 2,
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'average_rating',
        type: 'decimal',
        precision: 3,
        scale: 2,
        default: 0,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'total_sessions',
        type: 'int',
        default: 0,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'is_verified',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'profile_completeness',
        type: 'int',
        default: 0,
        isNullable: false,
        comment: '0-100 percentage of profile completion',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('mentor_profiles', 'profile_completeness');
    await queryRunner.dropColumn('mentor_profiles', 'is_verified');
    await queryRunner.dropColumn('mentor_profiles', 'total_sessions');
    await queryRunner.dropColumn('mentor_profiles', 'average_rating');
    await queryRunner.dropColumn('mentor_profiles', 'hourly_rate');
  }
}
