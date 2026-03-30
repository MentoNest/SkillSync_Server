import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateListingVersioning1700000000000 implements MigrationInterface {
  name = 'CreateListingVersioning1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── listings ────────────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'listings',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'description', type: 'text' },
          { name: 'price', type: 'decimal', precision: 10, scale: 2 },
          {
            name: 'category',
            type: 'enum',
            enum: ['mentorship', 'tutoring', 'consulting', 'coaching', 'workshop'],
            default: "'mentorship'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'published', 'paused', 'archived'],
            default: "'draft'",
          },
          { name: 'tags', type: 'text', isNullable: true },
          { name: 'duration_minutes', type: 'int', default: 60 },
          { name: 'cover_image_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'current_version', type: 'int', default: 1 },
          { name: 'created_by', type: 'uuid' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updated_at', type: 'timestamp with time zone', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'listings',
      new TableIndex({ name: 'IDX_listings_created_by', columnNames: ['created_by'] }),
    );
    await queryRunner.createIndex(
      'listings',
      new TableIndex({ name: 'IDX_listings_status', columnNames: ['status'] }),
    );

    // ── listing_versions ───────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'listing_versions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'gen_random_uuid()' },
          { name: 'listing_id', type: 'uuid' },
          { name: 'version_number', type: 'int' },
          { name: 'snapshot', type: 'jsonb' },
          { name: 'changed_fields', type: 'jsonb', default: "'[]'::jsonb" },
          { name: 'change_note', type: 'varchar', length: '500', isNullable: true },
          { name: 'changed_by', type: 'uuid' },
          { name: 'created_at', type: 'timestamp with time zone', default: 'now()' },
        ],
        uniques: [{ name: 'UQ_listing_versions_listing_version', columnNames: ['listing_id', 'version_number'] }],
      }),
      true,
    );

    await queryRunner.createIndex(
      'listing_versions',
      new TableIndex({
        name: 'IDX_listing_versions_listing_version',
        columnNames: ['listing_id', 'version_number'],
      }),
    );
    await queryRunner.createIndex(
      'listing_versions',
      new TableIndex({ name: 'IDX_listing_versions_changed_by', columnNames: ['changed_by'] }),
    );

    await queryRunner.createForeignKey(
      'listing_versions',
      new TableForeignKey({
        name: 'FK_listing_versions_listing',
        columnNames: ['listing_id'],
        referencedTableName: 'listings',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('listing_versions', true, true, true);
    await queryRunner.dropTable('listings', true, true, true);
  }
}
