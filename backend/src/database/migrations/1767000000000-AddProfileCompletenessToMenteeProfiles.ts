import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProfileCompletenessToMenteeProfiles1767000000000 implements MigrationInterface {
  name = 'AddProfileCompletenessToMenteeProfiles1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'mentee_profiles',
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
    await queryRunner.dropColumn('mentee_profiles', 'profile_completeness');
  }
}
