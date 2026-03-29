import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateServiceListingTags1700000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the join table
    await queryRunner.createTable(
      new Table({
        name: 'service_listing_tags',
        columns: [
          {
            name: 'service_listing_id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'tag_id',
            type: 'int',
            isPrimary: true,
          },
        ],
      }),
      true,
    );

    // Add foreign key constraints
    await queryRunner.createForeignKey(
      'service_listing_tags',
      new TableForeignKey({
        name: 'FK_service_listing_tags_service_listing',
        columnNames: ['service_listing_id'],
        referencedTableName: 'service_listings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'service_listing_tags',
      new TableForeignKey({
        name: 'FK_service_listing_tags_tag',
        columnNames: ['tag_id'],
        referencedTableName: 'tags',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the join table
    await queryRunner.dropTable('service_listing_tags');
  }
}
