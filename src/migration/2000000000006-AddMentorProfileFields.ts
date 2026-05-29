import { MigrationInterface, QueryRunner, TableIndex, TableColumn } from 'typeorm';

export class AddMentorProfileFields2000000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'skills', type: 'text', isNullable: true }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'hourlyRate', type: 'decimal', precision: 10, scale: 2, isNullable: true }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'currentRole', type: 'varchar', length: '255', isNullable: true }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'company', type: 'varchar', length: '255', isNullable: true }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'education', type: 'json', isNullable: true }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'certifications', type: 'json', isNullable: true }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'languages', type: 'text', isNullable: true }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'mentoringStyleDescription', type: 'text', isNullable: true }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'isVerified', type: 'boolean', isNullable: false, default: false }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'totalMentoringHours', type: 'int', isNullable: false, default: 0 }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'averageRating', type: 'decimal', precision: 3, scale: 2, isNullable: false, default: 0 }),
    );

    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({ name: 'numberOfReviews', type: 'int', isNullable: false, default: 0 }),
    );

    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({ name: 'IDX_MENTOR_PROFILES_SKILLS', columnNames: ['skills'], isUnique: false }),
    );

    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({ name: 'IDX_MENTOR_PROFILES_HOURLY_RATE', columnNames: ['hourlyRate'], isUnique: false }),
    );

    await queryRunner.createIndex(
      'mentor_profiles',
      new TableIndex({ name: 'IDX_MENTOR_PROFILES_AVG_RATING', columnNames: ['averageRating'], isUnique: false }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('mentor_profiles', 'IDX_MENTOR_PROFILES_AVG_RATING');
    await queryRunner.dropIndex('mentor_profiles', 'IDX_MENTOR_PROFILES_HOURLY_RATE');
    await queryRunner.dropIndex('mentor_profiles', 'IDX_MENTOR_PROFILES_SKILLS');

    const cols = [
      'numberOfReviews',
      'averageRating',
      'totalMentoringHours',
      'isVerified',
      'mentoringStyleDescription',
      'languages',
      'certifications',
      'education',
      'company',
      'currentRole',
      'hourlyRate',
      'skills',
    ];

    for (const c of cols) {
      try {
        await queryRunner.dropColumn('mentor_profiles', c);
      } catch (err) {
        // ignore
      }
    }
  }
}
