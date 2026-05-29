import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateMenteeProfileTable1750000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'mentee_profiles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'learningGoals',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'areasOfInterest',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'currentSkillLevel',
            type: 'enum',
            enum: ['beginner', 'intermediate', 'advanced'],
            isNullable: true,
          },
          {
            name: 'preferredMentoringStyle',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'timeCommitmentHoursPerWeek',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'professionalBackground',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'jobTitle',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'industry',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'portfolioLinks',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'mentee_profiles',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('mentee_profiles');
    const foreignKey = table?.foreignKeys.find((fk) => fk.columnNames.includes('userId'));

    if (foreignKey) {
      await queryRunner.dropForeignKey('mentee_profiles', foreignKey);
    }

    await queryRunner.dropTable('mentee_profiles');
  }
}
