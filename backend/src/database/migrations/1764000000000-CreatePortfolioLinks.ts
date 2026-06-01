import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreatePortfolioLinks1764000000000 implements MigrationInterface {
  name = 'CreatePortfolioLinks1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'portfolio_links',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'platform', type: 'varchar', length: '64', default: "'other'", isNullable: false },
          { name: 'url', type: 'varchar', length: '2048', isNullable: false },
          { name: 'title', type: 'varchar', length: '128', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'portfolio_links',
      new TableIndex({ name: 'IDX_portfolio_links_user_id', columnNames: ['user_id'] }),
    );

    await queryRunner.createForeignKey(
      'portfolio_links',
      new TableForeignKey({
        name: 'FK_portfolio_links_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('portfolio_links', true);
  }
}
