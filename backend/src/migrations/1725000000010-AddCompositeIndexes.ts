import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompositeIndexes1725000000010 implements MigrationInterface {
    name = 'AddCompositeIndexes1725000000010'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Composite index for User: walletAddress + status
        await queryRunner.query(`
            CREATE INDEX "IDX_users_walletAddress_status" ON "users" ("walletAddress", "status");
        `);

        // Composite index for User: roles + status + createdAt
        await queryRunner.query(`
            CREATE INDEX "IDX_users_role_status_createdAt" ON "users" ("status", "createdAt");
        `);

        // Composite index for MentorProfile: isVerified + averageRating
        await queryRunner.query(`
            CREATE INDEX "IDX_mentor_profiles_isVerified_averageRating" ON "mentor_profiles" ("isVerified", "averageRating");
        `);

        // Composite index for AvailabilitySlot: mentorId + dayOfWeek
        await queryRunner.query(`
            CREATE INDEX "IDX_availability_slots_mentorId_dayOfWeek" ON "availability_slots" ("mentorId", "dayOfWeek");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_users_walletAddress_status"`);
        await queryRunner.query(`DROP INDEX "IDX_users_role_status_createdAt"`);
        await queryRunner.query(`DROP INDEX "IDX_mentor_profiles_isVerified_averageRating"`);
        await queryRunner.query(`DROP INDEX "IDX_availability_slots_mentorId_dayOfWeek"`);
    }
}