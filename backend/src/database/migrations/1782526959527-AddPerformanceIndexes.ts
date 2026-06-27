import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPerformanceIndexes1782526959527 implements MigrationInterface {
    name = 'AddPerformanceIndexes1782526959527'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_users_wallet_address_is_verified" ON "users" ("wallet_address", "is_verified") `);
        await queryRunner.query(`CREATE INDEX "IDX_users_created_at" ON "users" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_availability_slots_mentor_day" ON "availability_slots" ("mentor_id", "day_of_week") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_availability_slots_mentor_day"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_wallet_address_is_verified"`);
    }

}
