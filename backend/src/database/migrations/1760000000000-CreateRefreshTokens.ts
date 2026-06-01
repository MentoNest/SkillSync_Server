import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateRefreshTokens1760000000000 implements MigrationInterface {
  name = 'CreateRefreshTokens1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'token_hash', type: 'varchar', length: '128', isNullable: false },
          { name: 'user_id', type: 'varchar', length: '128', isNullable: false },
          { name: 'wallet_address', type: 'varchar', length: '128', isNullable: true },
          { name: 'family_id', type: 'uuid', isNullable: false },
          { name: 'expires_at', type: 'timestamptz', isNullable: false },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
          { name: 'replaced_by_token_id', type: 'uuid', isNullable: true },
          { name: 'user_agent', type: 'text', isNullable: true },
          { name: 'ip_address', type: 'varchar', length: '64', isNullable: true },
          { name: 'device_fingerprint', type: 'varchar', length: '128', isNullable: true },
          { name: 'last_used_at', type: 'timestamptz', isNullable: true },
          { name: 'concurrent_reuse_detected_at', type: 'timestamptz', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'IDX_refresh_tokens_token_hash',
        columnNames: ['token_hash'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({ name: 'IDX_refresh_tokens_user_id', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({ name: 'IDX_refresh_tokens_family_id', columnNames: ['family_id'] }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refresh_tokens', true);
  }
}
