import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * #1316: refresh token rotation support.
 *
 * Adds the bookkeeping a rotation scheme needs to the existing `refresh_tokens`
 * table:
 *  - `jti`: the id claim of the refresh JWT, so a token can be correlated
 *    without storing the raw value a second time;
 *  - `familyId`: every token descending from one login shares it, which is what
 *    makes reuse detection able to revoke the whole chain;
 *  - `replacedById` / `usedAt` / `revocationReason`: why a token stopped being
 *    valid and what took its place;
 *  - widens `token` so a fully populated refresh JWT fits;
 *  - widens `deviceInfo` to hold the device fingerprint.
 *
 * Existing rows keep working: the new columns are nullable, and a row without a
 * `familyId` is simply treated as a family of one.
 */
export class AddRefreshTokenRotation1725000000021 implements MigrationInterface {
  name = 'AddRefreshTokenRotation1725000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('refresh_tokens');
    if (!table) {
      throw new Error('refresh_tokens table is missing - run the earlier migrations first');
    }

    const existing = new Set(table.columns.map((column) => column.name));

    if (!existing.has('jti')) {
      await queryRunner.addColumn(
        'refresh_tokens',
        new TableColumn({ name: 'jti', type: 'uuid', isNullable: true }),
      );
    }

    if (!existing.has('familyId')) {
      await queryRunner.addColumn(
        'refresh_tokens',
        new TableColumn({ name: 'familyId', type: 'uuid', isNullable: true }),
      );
    }

    if (!existing.has('replacedById')) {
      await queryRunner.addColumn(
        'refresh_tokens',
        new TableColumn({ name: 'replacedById', type: 'uuid', isNullable: true }),
      );
    }

    if (!existing.has('usedAt')) {
      await queryRunner.addColumn(
        'refresh_tokens',
        new TableColumn({
          name: 'usedAt',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }

    if (!existing.has('revocationReason')) {
      await queryRunner.addColumn(
        'refresh_tokens',
        new TableColumn({
          name: 'revocationReason',
          type: 'varchar',
          length: '32',
          isNullable: true,
        }),
      );
    }

    // A refresh JWT with the full claim set does not fit in 500 characters.
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ALTER COLUMN "token" TYPE varchar(1024)',
    );
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ALTER COLUMN "deviceInfo" TYPE varchar(64)',
    );

    await queryRunner.createIndices('refresh_tokens', [
      new TableIndex({ name: 'IDX_refresh_tokens_jti', columnNames: ['jti'], isUnique: true }),
      new TableIndex({ name: 'IDX_refresh_tokens_familyId', columnNames: ['familyId'] }),
      new TableIndex({
        name: 'IDX_refresh_tokens_user_active',
        columnNames: ['userId', 'isRevoked'],
      }),
      new TableIndex({ name: 'IDX_refresh_tokens_expiresAt', columnNames: ['expiresAt'] }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of [
      'IDX_refresh_tokens_expiresAt',
      'IDX_refresh_tokens_user_active',
      'IDX_refresh_tokens_familyId',
      'IDX_refresh_tokens_jti',
    ]) {
      await queryRunner.dropIndex('refresh_tokens', index);
    }

    for (const column of ['revocationReason', 'usedAt', 'replacedById', 'familyId', 'jti']) {
      await queryRunner.query(
        `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "${column}"`,
      );
    }

    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ALTER COLUMN "token" TYPE varchar(500)',
    );
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ALTER COLUMN "deviceInfo" TYPE varchar(255)',
    );
  }
}
