import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAvailability1765000000000 implements MigrationInterface {
  name = 'CreateAvailability1765000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'availability_slots',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'mentor_id', type: 'uuid', isNullable: false },
          { name: 'day_of_week', type: 'smallint', isNullable: false },
          { name: 'start_time', type: 'varchar', length: '5', isNullable: false },
          { name: 'end_time', type: 'varchar', length: '5', isNullable: false },
          { name: 'timezone', type: 'varchar', length: '64', default: "'UTC'", isNullable: false },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'availability_exceptions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'mentor_id', type: 'uuid', isNullable: false },
          { name: 'exception_date', type: 'date', isNullable: false },
          { name: 'start_time', type: 'varchar', length: '5', isNullable: true },
          { name: 'end_time', type: 'varchar', length: '5', isNullable: true },
          { name: 'reason', type: 'varchar', length: '256', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );

    for (const table of ['availability_slots', 'availability_exceptions']) {
      await queryRunner.createIndex(
        table,
        new TableIndex({ name: `IDX_${table}_mentor_id`, columnNames: ['mentor_id'] }),
      );
      await queryRunner.createForeignKey(
        table,
        new TableForeignKey({
          name: `FK_${table}_mentor`,
          columnNames: ['mentor_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('availability_exceptions', true);
    await queryRunner.dropTable('availability_slots', true);
  }
}
