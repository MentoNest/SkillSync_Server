import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProfileVersionToUserProfiles1764000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'profile_version',
        type: 'int',
        isNullable: false,
        default: 1,
      }),
    );

    await queryRunner.addColumn(
      'mentee_profiles',
      new TableColumn({
        name: 'profile_version',
        type: 'int',
        isNullable: false,
        default: 1,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('mentor_profiles', 'profile_version');
    await queryRunner.dropColumn('mentee_profiles', 'profile_version');
  }
}
