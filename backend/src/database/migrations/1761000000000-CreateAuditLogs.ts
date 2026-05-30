import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAuditLogs1761000000000 implements MigrationInterface {
  name = 'CreateAuditLogs1761000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'varchar', length: '128', isNullable: true },
          { name: 'event_type', type: 'varchar', length: '64', isNullable: false },
          { name: 'timestamp', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'ip_address', type: 'varchar', length: '64', isNullable: true },
          { name: 'user_agent', type: 'text', isNullable: true },
          { name: 'details', type: 'jsonb', default: "'{}'::jsonb", isNullable: false },
          { name: 'is_suspicious', type: 'boolean', default: 'false', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'audit_logs_archive',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'varchar', length: '128', isNullable: true },
          { name: 'event_type', type: 'varchar', length: '64', isNullable: false },
          { name: 'timestamp', type: 'timestamptz', isNullable: false },
          { name: 'ip_address', type: 'varchar', length: '64', isNullable: true },
          { name: 'user_agent', type: 'text', isNullable: true },
          { name: 'details', type: 'jsonb', isNullable: false },
          { name: 'is_suspicious', type: 'boolean', isNullable: false },
          { name: 'archived_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({ name: 'IDX_audit_logs_user_id', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({ name: 'IDX_audit_logs_event_type', columnNames: ['event_type'] }),
    );
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({ name: 'IDX_audit_logs_timestamp', columnNames: ['timestamp'] }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_logs_archive', true);
    await queryRunner.dropTable('audit_logs', true);
  }
}
