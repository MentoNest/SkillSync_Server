import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsersTable1769059634884 implements MigrationInterface {
    name = 'CreateUsersTable1769059634884'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "firstName" character varying NOT NULL,
                "lastName" character varying NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_users_email" UNIQUE ("email")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "users"`);
    }
}
