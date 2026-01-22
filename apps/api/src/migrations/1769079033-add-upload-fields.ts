import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUploadFields1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add avatarUrl to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'avatarUrl',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );

    // Add documentUrl to mentor_profiles table
    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'documentUrl',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'avatarUrl');
    await queryRunner.dropColumn('mentor_profiles', 'documentUrl');
  }
}
