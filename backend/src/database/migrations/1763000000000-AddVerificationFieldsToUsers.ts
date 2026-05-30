import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVerificationFieldsToUsers1763000000000 implements MigrationInterface {
  name = 'AddVerificationFieldsToUsers1763000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({ name: 'is_verified', type: 'boolean', default: false, isNullable: false }),
      new TableColumn({ name: 'verified_at', type: 'timestamptz', isNullable: true }),
      new TableColumn({ name: 'verified_by', type: 'varchar', length: '128', isNullable: true }),
      new TableColumn({ name: 'verification_notes', type: 'text', isNullable: true }),
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('users', [
      'is_verified',
      'verified_at',
      'verified_by',
      'verification_notes',
    ]);
  }
}
