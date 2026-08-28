import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * #1175: Creates the `user_suspensions` table backing the account
 * suspension feature (temporary or permanent, with admin audit trail).
 */
export class CreateUserSuspensionsTable1725000000008 implements MigrationInterface {
  name = 'CreateUserSuspensionsTable1725000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('user_suspensions');
    if (hasTable) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: 'user_suspensions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'reason', type: 'text', isNullable: false },
          { name: 'suspendedBy', type: 'uuid', isNullable: false },
          { name: 'suspendedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'suspendedUntil', type: 'timestamp', isNullable: true },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'liftedAt', type: 'timestamp', isNullable: true },
          { name: 'liftedBy', type: 'uuid', isNullable: true },
          { name: 'liftReason', type: 'varchar', length: '20', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'user_suspensions',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndices('user_suspensions', [
      new TableIndex({ name: 'IDX_user_suspensions_userId', columnNames: ['userId'] }),
      new TableIndex({ name: 'IDX_user_suspensions_suspendedBy', columnNames: ['suspendedBy'] }),
      new TableIndex({ name: 'IDX_user_suspensions_isActive', columnNames: ['isActive'] }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_suspensions', true);
  }
}
