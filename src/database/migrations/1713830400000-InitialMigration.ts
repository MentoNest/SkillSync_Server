import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMigration1713830400000 implements MigrationInterface {
  name = 'InitialMigration1713830400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Initial migration - add your schema changes here
    console.log('Initial migration executed');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert migration changes here
    console.log('Initial migration reverted');
  }
}
