import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateMenteeProfilesTable1725000000003 implements MigrationInterface {
  name = 'CreateMenteeProfilesTable1725000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."mentee_skill_level_enum" AS ENUM('beginner', 'intermediate', 'advanced')
    `);

    await queryRunner.createTable(
      new Table({
        name: 'mentee_profiles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'learningGoals',
            type: 'text',
            isArray: true,
            default: `'{}'`,
          },
          {
            name: 'areasOfInterest',
            type: 'text',
            isArray: true,
            default: `'{}'`,
          },
          {
            name: 'currentSkillLevel',
            type: 'enum',
            enum: ['beginner', 'intermediate', 'advanced'],
            enumName: 'mentee_skill_level_enum',
            default: `'beginner'`,
          },
          {
            name: 'preferredMentoringStyle',
            type: 'text',
            isArray: true,
            default: `'{}'`,
          },
          {
            name: 'timeCommitment',
            type: 'int',
            default: 0,
          },
          {
            name: 'professionalBackground',
            type: 'text',
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
            isArray: true,
            default: `'{}'`,
          },
          {
            name: 'profileCompletionPercentage',
            type: 'int',
            default: 0,
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
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('mentee_profiles', true);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."mentee_skill_level_enum"`);
  }
}
