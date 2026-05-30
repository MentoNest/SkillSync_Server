import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddUsernameAndDisplayName1766000000000 implements MigrationInterface {
  name = 'AddUsernameAndDisplayName1766000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users 
      ADD COLUMN username varchar(30),
      ADD COLUMN display_name varchar(50),
      ADD COLUMN username_changed_at timestamptz
    `);

    await queryRunner.createIndex(
      'users',
      new TableIndex({ name: 'IDX_users_username', columnNames: ['username'], isUnique: true }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'IDX_users_username');
    await queryRunner.query(`
      ALTER TABLE users 
      DROP COLUMN username_changed_at,
      DROP COLUMN display_name,
      DROP COLUMN username
    `);
  }
}
