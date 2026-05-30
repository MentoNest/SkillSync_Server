import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUserSuspensions1766000000000 implements MigrationInterface {
  name = 'CreateUserSuspensions1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_suspensions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'varchar', length: '128', isNullable: false },
          { name: 'reason', type: 'text', isNullable: false },
          { name: 'suspended_by', type: 'varchar', length: '128', isNullable: false },
          { name: 'suspended_at', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'suspended_until', type: 'timestamptz', isNullable: true },
          { name: 'lifted_at', type: 'timestamptz', isNullable: true },
          { name: 'lifted_by', type: 'varchar', length: '128', isNullable: true },
          { name: 'lifted_reason', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
    );

    await queryRunner.createIndex(
      'user_suspensions',
      new TableIndex({ name: 'IDX_USER_SUSPENSIONS_USER_ID', columnNames: ['user_id'] }),
    );

    await queryRunner.createIndex(
      'user_suspensions',
      new TableIndex({ name: 'IDX_USER_SUSPENSIONS_SUSPENDED_AT', columnNames: ['suspended_at'] }),
    );

    await queryRunner.createIndex(
      'user_suspensions',
      new TableIndex({ name: 'IDX_USER_SUSPENSIONS_SUSPENDED_UNTIL', columnNames: ['suspended_until'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_suspensions');
  }
}
