import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateUserProfiles1763000000000 implements MigrationInterface {
  name = 'CreateUserProfiles1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'mentor_profiles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'bio', type: 'text', isNullable: false },
          { name: 'expertise', type: 'text', isNullable: true },
          { name: 'years_of_experience', type: 'int', isNullable: false },
          { name: 'preferred_mentoring_style', type: 'text', isNullable: true },
          { name: 'availability_hours_per_week', type: 'int', isNullable: true },
          { name: 'availability_details', type: 'text', isNullable: true },
          { name: 'user_id', type: 'uuid', isNullable: false, isUnique: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'mentee_profiles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'learning_goals', type: 'text', isNullable: false },
          { name: 'areas_of_interest', type: 'text', isNullable: true },
          { name: 'current_skill_level', type: 'varchar', length: '255', isNullable: false },
          { name: 'preferred_mentoring_style', type: 'text', isNullable: true },
          { name: 'time_commitment_hours_per_week', type: 'int', isNullable: false },
          { name: 'professional_background', type: 'text', isNullable: true },
          { name: 'job_title', type: 'varchar', length: '255', isNullable: true },
          { name: 'industry', type: 'varchar', length: '255', isNullable: true },
          { name: 'portfolio_links', type: 'text', isNullable: true },
          { name: 'user_id', type: 'uuid', isNullable: false, isUnique: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'mentor_profiles',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'mentee_profiles',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const mentorForeignKey = await queryRunner.getTable('mentor_profiles');
    const menteeForeignKey = await queryRunner.getTable('mentee_profiles');

    if (mentorForeignKey) {
      const foreignKey = mentorForeignKey.foreignKeys.find((fk) => fk.columnNames.includes('user_id'));
      if (foreignKey) await queryRunner.dropForeignKey('mentor_profiles', foreignKey);
    }

    if (menteeForeignKey) {
      const foreignKey = menteeForeignKey.foreignKeys.find((fk) => fk.columnNames.includes('user_id'));
      if (foreignKey) await queryRunner.dropForeignKey('mentee_profiles', foreignKey);
    }

    await queryRunner.dropTable('mentor_profiles', true);
    await queryRunner.dropTable('mentee_profiles', true);
  }
}
