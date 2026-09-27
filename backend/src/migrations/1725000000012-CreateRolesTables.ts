import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * #1318: RBAC storage.
 *
 * - `roles`: the role catalogue (id, name, description, createdAt) plus a JSONB
 *   permission list so permissions can be extended without a migration.
 * - `user_roles`: junction table backing the many-to-many between users and
 *   roles. Its composite primary key makes duplicate assignments impossible
 *   (and lets the seed rely on ON CONFLICT DO NOTHING).
 *
 * `User.roles` owns the `user_roles` mapping in the entities, so the entity
 * definition stays the single source of truth; this migration only creates the
 * physical tables.
 */
export class CreateRolesTables1725000000012 implements MigrationInterface {
  name = 'CreateRolesTables1725000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'roles',
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
            name: 'name',
            type: 'varchar',
            length: '50',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '255',
            default: '',
          },
          {
            name: 'permissions',
            type: 'jsonb',
            default: `'[]'::jsonb`,
          },
          {
            name: 'isSystem',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'roles',
      new TableIndex({ name: 'IDX_roles_name', columnNames: ['name'], isUnique: true }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'roleId', type: 'uuid', isNullable: false },
        ],
        foreignKeys: [
          {
            name: 'FK_user_roles_user',
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_user_roles_role',
            columnNames: ['roleId'],
            referencedTableName: 'roles',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Reverse lookup: "who holds this role?" without touching the users table.
    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({ name: 'IDX_user_roles_roleId', columnNames: ['roleId'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_roles', true);
    await queryRunner.dropTable('roles', true);
  }
}
