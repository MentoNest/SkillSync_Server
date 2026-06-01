import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateProfileHistory1764000000000 implements MigrationInterface {
  name = 'CreateProfileHistory1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'profile_history',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'field_name', type: 'varchar', length: '128', isNullable: false },
          { name: 'old_value', type: 'jsonb', isNullable: true },
          { name: 'new_value', type: 'jsonb', isNullable: true },
          { name: 'changed_by', type: 'varchar', length: '128', isNullable: false },
          { name: 'change_reason', type: 'varchar', length: '32', isNullable: false },
          {
            name: 'changed_at',
            type: 'timestamptz',
            precision: 3,
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'profile_history',
      new TableIndex({ name: 'IDX_profile_history_user_id', columnNames: ['user_id'] }),
    );

    await queryRunner.createIndex(
      'profile_history',
      new TableIndex({ name: 'IDX_profile_history_changed_at', columnNames: ['changed_at'] }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('profile_history', true);
  }
}
