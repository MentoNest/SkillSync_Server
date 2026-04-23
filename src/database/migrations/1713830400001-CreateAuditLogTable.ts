import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAuditLogTable1713830400001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'walletAddress',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'eventType',
            type: 'enum',
            enum: [
              'login_success',
              'login_failed',
              'nonce_generated',
              'signature_verified',
              'token_refreshed',
              'token_revoked',
              'logout',
              'permission_denied',
              'account_locked',
              'account_unlocked',
            ],
            isNullable: false,
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'userAgent',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'country',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'latitude',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'longitude',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'isSuspicious',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'suspiciousReasons',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'deviceFingerprint',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'sessionId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_AUDIT_LOGS_USER_ID_CREATED_AT',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_AUDIT_LOGS_WALLET_ADDRESS_CREATED_AT',
        columnNames: ['walletAddress', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_AUDIT_LOGS_IP_ADDRESS_CREATED_AT',
        columnNames: ['ipAddress', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_AUDIT_LOGS_IS_SUSPICIOUS_CREATED_AT',
        columnNames: ['isSuspicious', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_AUDIT_LOGS_EVENT_TYPE_CREATED_AT',
        columnNames: ['eventType', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_AUDIT_LOGS_CREATED_AT',
        columnNames: ['createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_logs', true);
  }
}
