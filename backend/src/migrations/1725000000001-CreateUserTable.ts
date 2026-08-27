import { MigrationInterface, QueryRunner, Table, TableIndex, TableUnique } from 'typeorm';

export class CreateUserTable1725000000001 implements MigrationInterface {
  name = 'CreateUserTable1725000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'pending', 'suspended', 'deleted')
    `);

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'walletAddress',
            type: 'varchar',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'email',
            type: 'varchar',
            isUnique: true,
            isNullable: true,
          },
          {
            name: 'displayName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'passwordHash',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'tokenVersion',
            type: 'int',
            default: 0,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'pending', 'suspended', 'deleted'],
            enumName: 'users_status_enum',
            default: `'pending'`,
          },
          {
            name: 'avatarUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'timezone',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'locale',
            type: 'varchar',
            isNullable: true,
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
          {
            name: 'lastLoginAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('users', [
      new TableIndex({
        name: 'IDX_users_walletAddress',
        columnNames: ['walletAddress'],
      }),
      new TableIndex({
        name: 'IDX_users_status',
        columnNames: ['status'],
      }),
      new TableIndex({
        name: 'IDX_users_createdAt',
        columnNames: ['createdAt'],
      }),
      new TableIndex({
        name: 'IDX_users_lastLoginAt',
        columnNames: ['lastLoginAt'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users', true);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_status_enum"`);
  }
}
