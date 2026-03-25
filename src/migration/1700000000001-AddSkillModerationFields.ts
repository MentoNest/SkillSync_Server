import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSkillModerationFields1700000000001 implements MigrationInterface {
    name = 'AddSkillModerationFields1700000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add moderation status column with default 'pending'
        await queryRunner.query(`
            ALTER TABLE skills 
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
        `);

        // Add rejection reason column
        await queryRunner.query(`
            ALTER TABLE skills 
            ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
        `);

        // Add moderated by column (UUID of admin)
        await queryRunner.query(`
            ALTER TABLE skills 
            ADD COLUMN IF NOT EXISTS "moderatedBy" UUID;
        `);

        // Add moderated at timestamp
        await queryRunner.query(`
            ALTER TABLE skills 
            ADD COLUMN IF NOT EXISTS "moderatedAt" TIMESTAMP WITH TIME ZONE;
        `);

        // Create index on status for faster filtering
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
        `);

        // Set existing skills to 'approved' status (backward compatibility)
        await queryRunner.query(`
            UPDATE skills SET status = 'approved' WHERE status = 'pending';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_status;`);
        await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS "moderatedAt";`);
        await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS "moderatedBy";`);
        await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS "rejectionReason";`);
        await queryRunner.query(`ALTER TABLE skills DROP COLUMN IF EXISTS status;`);
    }
}
