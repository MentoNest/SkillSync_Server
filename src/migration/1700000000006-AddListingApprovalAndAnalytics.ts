import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddListingApprovalAndAnalytics1700000006 implements MigrationInterface {
  name = 'AddListingApprovalAndAnalytics1700000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add approval status column
    await queryRunner.addColumn(
      'service_listings',
      new TableColumn({
        name: 'approvalStatus',
        type: 'enum',
        enum: ['pending', 'approved', 'rejected'],
        default: "'pending'",
      }),
    );

    // Add rejection reason column
    await queryRunner.addColumn(
      'service_listings',
      new TableColumn({
        name: 'rejectionReason',
        type: 'varchar',
        isNullable: true,
      }),
    );

    // Add approved by column
    await queryRunner.addColumn(
      'service_listings',
      new TableColumn({
        name: 'approvedBy',
        type: 'varchar',
        isNullable: true,
      }),
    );

    // Add approved at column
    await queryRunner.addColumn(
      'service_listings',
      new TableColumn({
        name: 'approvedAt',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    // Add view count column
    await queryRunner.addColumn(
      'service_listings',
      new TableColumn({
        name: 'viewCount',
        type: 'int',
        default: 0,
      }),
    );

    // Add click count column
    await queryRunner.addColumn(
      'service_listings',
      new TableColumn({
        name: 'clickCount',
        type: 'int',
        default: 0,
      }),
    );

    // Add conversion count column
    await queryRunner.addColumn(
      'service_listings',
      new TableColumn({
        name: 'conversionCount',
        type: 'int',
        default: 0,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('service_listings', 'conversionCount');
    await queryRunner.dropColumn('service_listings', 'clickCount');
    await queryRunner.dropColumn('service_listings', 'viewCount');
    await queryRunner.dropColumn('service_listings', 'approvedAt');
    await queryRunner.dropColumn('service_listings', 'approvedBy');
    await queryRunner.dropColumn('service_listings', 'rejectionReason');
    await queryRunner.dropColumn('service_listings', 'approvalStatus');
  }
}