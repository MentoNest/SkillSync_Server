import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTagAndSkillTag1670000000001 implements MigrationInterface {
    name = 'CreateTagAndSkillTag1670000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE tags (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                slug VARCHAR(100) NOT NULL UNIQUE,
                "createdAt" TIMESTAMP DEFAULT now(),
                "updatedAt" TIMESTAMP DEFAULT now()
            );

            CREATE TABLE skill_tags (
                skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (skill_id, tag_id)
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS skill_tags;
            DROP TABLE IF EXISTS tags;
        `);
    }
}
