import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateSessionsTable1745800000000 implements MigrationInterface {
  name = 'CreateSessionsTable1745800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sessions table
    await queryRunner.createTable(
      new Table({
        name: 'sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'mentorId',
            type: 'uuid',
          },
          {
            name: 'menteeId',
            type: 'uuid',
          },
          {
            name: 'startTime',
            type: 'timestamp',
          },
          {
            name: 'endTime',
            type: 'timestamp',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
            default: "'pending'",
          },
          {
            name: 'meetingUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'rating',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'review',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'cancelledAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'cancellationReason',
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
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_MENTOR_ID',
        columnNames: ['mentorId'],
      }),
    );

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_MENTEE_ID',
        columnNames: ['menteeId'],
      }),
    );

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_TIME_RANGE',
        columnNames: ['startTime', 'endTime'],
      }),
    );

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'IDX_SESSIONS_MENTOR_TIME',
        columnNames: ['mentorId', 'startTime', 'endTime'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'sessions',
      new TableForeignKey({
        name: 'FK_SESSIONS_MENTOR',
        columnNames: ['mentorId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'sessions',
      new TableForeignKey({
        name: 'FK_SESSIONS_MENTEE',
        columnNames: ['menteeId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const table = await queryRunner.getTable('sessions');
    const mentorForeignKey = table?.foreignKeys.find((fk) => fk.name === 'FK_SESSIONS_MENTOR');
    const menteeForeignKey = table?.foreignKeys.find((fk) => fk.name === 'FK_SESSIONS_MENTEE');

    if (mentorForeignKey) {
      await queryRunner.dropForeignKey('sessions', mentorForeignKey);
    }
    if (menteeForeignKey) {
      await queryRunner.dropForeignKey('sessions', menteeForeignKey);
    }

    // Drop indexes
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_MENTOR_TIME');
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_TIME_RANGE');
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_STATUS');
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_MENTEE_ID');
    await queryRunner.dropIndex('sessions', 'IDX_SESSIONS_MENTOR_ID');

    // Drop table
    await queryRunner.dropTable('sessions');
  }
}
