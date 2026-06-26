import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddUserProfileFields1750300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      { name: 'display_name', type: 'varchar', length: '100', isNullable: true } as any,
      { name: 'email', type: 'varchar', length: '255', isNullable: true } as any,
      { name: 'status', type: 'varchar', length: '20', default: "'active'" } as any,
      { name: 'avatar_url', type: 'varchar', length: '512', isNullable: true } as any,
      { name: 'timezone', type: 'varchar', length: '50', isNullable: true } as any,
      { name: 'locale', type: 'varchar', length: '10', isNullable: true } as any,
      { name: 'last_login_at', type: 'timestamptz', isNullable: true } as any,
      { name: 'deleted_at', type: 'timestamptz', isNullable: true } as any,
    ]);

    await queryRunner.createIndex('users', new TableIndex({
      name: 'IDX_users_status',
      columnNames: ['status'],
    }));

    await queryRunner.createIndex('users', new TableIndex({
      name: 'IDX_users_email',
      columnNames: ['email'],
      isUnique: true,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'IDX_users_status');
    await queryRunner.dropIndex('users', 'IDX_users_email');
    await queryRunner.dropColumns('users', [
      'display_name', 'email', 'status', 'avatar_url', 'timezone', 'locale', 'last_login_at', 'deleted_at',
    ]);
  }
}
