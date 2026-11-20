import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminSeedTables1795170000000 implements MigrationInterface {
  name = 'CreateAdminSeedTables1795170000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE roles (
        name varchar(64) PRIMARY KEY,
        permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE users (
        wallet_address varchar(56) PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE user_roles (
        wallet_address varchar(56) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
        role_name varchar(64) NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
        PRIMARY KEY (wallet_address, role_name)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE user_roles');
    await queryRunner.query('DROP TABLE users');
    await queryRunner.query('DROP TABLE roles');
  }
}
