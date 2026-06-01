import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPublicProfileFieldsToUsers1765000000000 implements MigrationInterface {
  name = 'AddPublicProfileFieldsToUsers1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'display_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'avatar_url',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'avatar_url');
    await queryRunner.dropColumn('users', 'display_name');
  }
}
