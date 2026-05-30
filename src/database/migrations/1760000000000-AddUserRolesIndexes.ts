import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddUserRolesIndexes1760000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({
        name: 'IDX_USER_ROLES_ROLE_ID',
        columnNames: ['roleId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('user_roles', 'IDX_USER_ROLES_ROLE_ID');
  }
}
