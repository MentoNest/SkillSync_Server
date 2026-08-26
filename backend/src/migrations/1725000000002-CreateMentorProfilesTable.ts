import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateMentorProfilesTable1725000000002 implements MigrationInterface {
  name = 'CreateMentorProfilesTable1725000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'mentor_profiles',
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
            name: 'bio',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'skills',
            type: 'text',
            isArray: true,
            default: `'{}'`,
          },
          {
            name: 'hourlyRate',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'expertiseAreas',
            type: 'text',
            isArray: true,
            default: `'{}'`,
          },
          {
            name: 'yearsOfExperience',
            type: 'int',
            default: 0,
          },
          {
            name: 'currentRole',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'company',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'education',
            type: 'jsonb',
            default: `'[]'`,
          },
          {
            name: 'certifications',
            type: 'jsonb',
            default: `'[]'`,
          },
          {
            name: 'languagesSpoken',
            type: 'text',
            isArray: true,
            default: `'{}'`,
          },
          {
            name: 'mentoringStyle',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isVerified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'totalMentoringHours',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'averageRating',
            type: 'decimal',
            precision: 3,
            scale: 2,
            default: 0,
          },
          {
            name: 'numberOfReviews',
            type: 'int',
            default: 0,
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
      'mentor_profiles',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndices('mentor_profiles', [
      new TableIndex({
        name: 'IDX_mentor_profiles_skills',
        columnNames: ['skills'],
      }),
      new TableIndex({
        name: 'IDX_mentor_profiles_hourlyRate',
        columnNames: ['hourlyRate'],
      }),
      new TableIndex({
        name: 'IDX_mentor_profiles_averageRating',
        columnNames: ['averageRating'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('mentor_profiles', true);
  }
}
