import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTimezoneAndAvatarToUsers1763000000000 implements MigrationInterface {
  name = 'AddTimezoneAndAvatarToUsers1763000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({ name: 'timezone', type: 'varchar', length: '64', default: "'UTC'", isNullable: false }),
      new TableColumn({ name: 'avatar_url', type: 'varchar', length: '512', isNullable: true }),
      new TableColumn({ name: 'avatar_thumbnail_url', type: 'varchar', length: '512', isNullable: true }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'timezone');
    await queryRunner.dropColumn('users', 'avatar_url');
    await queryRunner.dropColumn('users', 'avatar_thumbnail_url');
  }
}
