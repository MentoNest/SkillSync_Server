import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class ExpandUserEntity1745493953000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({ name: 'email', type: 'varchar', isNullable: true, isUnique: true }),
      new TableColumn({ name: 'displayName', type: 'varchar', isNullable: true }),
      new TableColumn({
        name: 'status',
        type: 'enum',
        enum: ['active', 'pending', 'suspended', 'deleted'],
        default: "'pending'",
      }),
      new TableColumn({ name: 'avatarUrl', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'timezone', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'locale', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'lastLoginAt', type: 'timestamp', isNullable: true }),
      new TableColumn({ name: 'deletedAt', type: 'timestamp', isNullable: true }),
    ]);

    await queryRunner.createIndex('users', new TableIndex({ name: 'IDX_USERS_EMAIL', columnNames: ['email'] }));
    await queryRunner.createIndex('users', new TableIndex({ name: 'IDX_USERS_STATUS', columnNames: ['status'] }));
    await queryRunner.createIndex('users', new TableIndex({ name: 'IDX_USERS_CREATED_AT', columnNames: ['createdAt'] }));
    await queryRunner.createIndex('users', new TableIndex({ name: 'IDX_USERS_LAST_LOGIN_AT', columnNames: ['lastLoginAt'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'IDX_USERS_LAST_LOGIN_AT');
    await queryRunner.dropIndex('users', 'IDX_USERS_CREATED_AT');
    await queryRunner.dropIndex('users', 'IDX_USERS_STATUS');
    await queryRunner.dropIndex('users', 'IDX_USERS_EMAIL');
    await queryRunner.dropColumns('users', ['email', 'displayName', 'status', 'avatarUrl', 'timezone', 'locale', 'lastLoginAt', 'deletedAt']);
  }
}
