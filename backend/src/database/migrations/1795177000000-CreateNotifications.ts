import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1795177000000 implements MigrationInterface {
  name = 'CreateNotifications1795177000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE notification_type_enum AS ENUM (
        'session_reminder',
        'message',
        'profile_verification',
        'suspension_warning',
        'platform_announcement'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(56) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
        type notification_type_enum NOT NULL,
        title VARCHAR(200) NOT NULL,
        body VARCHAR(2000) NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notifications_user_created
        ON notifications (user_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notifications_user_read_created
        ON notifications (user_id, is_read, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE notification_preferences (
        user_id VARCHAR(56) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
        type notification_type_enum NOT NULL,
        opted_out BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (user_id, type)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_preferences`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notifications_user_read_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notifications_user_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
    await queryRunner.query(`DROP TYPE IF EXISTS notification_type_enum`);
  }
}
