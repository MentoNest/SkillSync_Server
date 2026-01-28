import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDeletedAtToMentorProfiles1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'deleted_at',
        type: 'timestamp',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('mentor_profiles', 'deleted_at');
  }
}