import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDatabaseBackupsTable1714000000000 implements MigrationInterface {
  name = 'CreateDatabaseBackupsTable1714000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'database_backups',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'file_name',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'file_path',
            type: 'varchar',
            length: '1000',
            isNullable: false,
          },
          {
            name: 'file_size',
            type: 'bigint',
            isNullable: false,
            default: '0',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['automated', 'manual', 'scheduled_verification'],
            default: "'automated'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'in_progress', 'completed', 'failed', 'verified', 'deleted'],
            default: "'pending'",
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_encrypted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'includes_wal',
            type: 'boolean',
            default: false,
          },
          {
            name: 'wal_start_timestamp',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'wal_end_timestamp',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'retention_until',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'verification_status',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'verified_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'uploaded_to_s3',
            type: 'boolean',
            default: false,
          },
          {
            name: 's3_key',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 's3_bucket',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Add indexes for better query performance
    await queryRunner.createIndex(
      'database_backups',
      new TableIndex({
        name: 'IDX_BACKUP_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'database_backups',
      new TableIndex({
        name: 'IDX_BACKUP_CREATED_AT',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createIndex(
      'database_backups',
      new TableIndex({
        name: 'IDX_BACKUP_RETENTION_UNTIL',
        columnNames: ['retention_until'],
      }),
    );

    await queryRunner.createIndex(
      'database_backups',
      new TableIndex({
        name: 'IDX_BACKUP_TYPE',
        columnNames: ['type'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('database_backups', true);
  }
}
