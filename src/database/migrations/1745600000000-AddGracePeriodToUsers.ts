import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGracePeriodToUsers1745600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'gracePeriodEndsAt',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'gracePeriodEndsAt');
  }
}
