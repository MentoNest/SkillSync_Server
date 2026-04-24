import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateUserAndRoleTablesForSeed1713830400002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create roles table
    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create roles index on name for faster lookups
    await queryRunner.createIndex(
      'roles',
      new TableIndex({
        name: 'IDX_ROLES_NAME',
        columnNames: ['name'],
      }),
    );

    // Create users table
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'walletAddress',
            type: 'varchar',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'nonce',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'tokenVersion',
            type: 'int',
            default: 1,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create users index on wallet address for faster lookups
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_USERS_WALLET_ADDRESS',
        columnNames: ['walletAddress'],
      }),
    );

    // Create user_roles junction table
    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'roleId',
            type: 'uuid',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create primary key for user_roles
    await queryRunner.createPrimaryKey(
      'user_roles',
      ['userId', 'roleId'],
    );

    // Add foreign key for userId
    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key for roleId
    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        columnNames: ['roleId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'roles',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const table = await queryRunner.getTable('user_roles');
    const userForeignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('userId') !== -1,
    );
    const roleForeignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('roleId') !== -1,
    );

    if (userForeignKey) {
      await queryRunner.dropForeignKey('user_roles', userForeignKey);
    }

    if (roleForeignKey) {
      await queryRunner.dropForeignKey('user_roles', roleForeignKey);
    }

    // Drop indexes
    await queryRunner.dropIndex('user_roles', 'IDX_USER_ROLES_USER_ID');
    await queryRunner.dropIndex('user_roles', 'IDX_USER_ROLES_ROLE_ID');
    await queryRunner.dropIndex('users', 'IDX_USERS_WALLET_ADDRESS');
    await queryRunner.dropIndex('roles', 'IDX_ROLES_NAME');

    // Drop tables
    await queryRunner.dropTable('user_roles');
    await queryRunner.dropTable('users');
    await queryRunner.dropTable('roles');
  }
}
