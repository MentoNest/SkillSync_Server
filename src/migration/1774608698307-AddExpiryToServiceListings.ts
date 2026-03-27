import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddExpiryToServiceListings1774608698307 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            'service_listings',
            new TableColumn({
                name: 'expiresAt',
                type: 'timestamp',
                isNullable: true,
                comment: 'The date and time when the service listing expires',
            }),
        );

        // Optional: Calculate initial values for existing listings if duration exists
        await queryRunner.query(`
            UPDATE service_listings 
            SET "expiresAt" = "createdAt" + (duration * interval '1 hour')
            WHERE duration IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('service_listings', 'expiresAt');
    }

}
