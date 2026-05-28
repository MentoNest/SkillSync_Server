import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateUsersAndRoles1762000000000 implements MigrationInterface {
  name = 'CreateUsersAndRoles1762000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'varchar', length: '64', isNullable: false, isUnique: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'wallet_address', type: 'varchar', length: '128', isNullable: false, isUnique: true },
          { name: 'token_version', type: 'int', default: '0', isNullable: false },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'role_id', type: 'uuid', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({ name: 'IDX_users_wallet_address', columnNames: ['wallet_address'], isUnique: true }),
    );

    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({ name: 'IDX_user_roles_user_id', columnNames: ['user_id'] }),
    );

    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({ name: 'IDX_user_roles_role_id', columnNames: ['role_id'] }),
    );

    await queryRunner.createPrimaryKey('user_roles', ['user_id', 'role_id']);

    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        name: 'FK_user_roles_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        name: 'FK_user_roles_role',
        columnNames: ['role_id'],
        referencedTableName: 'roles',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_roles', true);
    await queryRunner.dropTable('users', true);
    await queryRunner.dropTable('roles', true);
  }
}
