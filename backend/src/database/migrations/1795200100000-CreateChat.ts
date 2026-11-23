import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChat1795200100000 implements MigrationInterface {
  name = 'CreateChat1795200100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id      VARCHAR(128)  NOT NULL,
        mentor_address  VARCHAR(56)   NOT NULL
                          REFERENCES users(wallet_address) ON DELETE CASCADE,
        mentee_address  VARCHAR(56)   NOT NULL
                          REFERENCES users(wallet_address) ON DELETE CASCADE,
        last_message_at TIMESTAMPTZ(3) NULL,
        created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_chat_rooms_session UNIQUE (session_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_rooms_mentor
        ON chat_rooms (mentor_address)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_rooms_mentee
        ON chat_rooms (mentee_address)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id     UUID          NOT NULL
                      REFERENCES chat_rooms(id) ON DELETE CASCADE,
        sender_id   VARCHAR(56)   NOT NULL
                      REFERENCES users(wallet_address) ON DELETE CASCADE,
        body        TEXT          NOT NULL DEFAULT '',
        attachments JSONB         NOT NULL DEFAULT '[]'::jsonb,
        read_at     TIMESTAMPTZ(3) NULL,
        created_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
        ON chat_messages (room_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_unread
        ON chat_messages (room_id, sender_id, read_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_chat_messages_room_unread`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_chat_messages_room_created`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS chat_messages`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_rooms_mentee`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_rooms_mentor`);
    await queryRunner.query(`DROP TABLE IF EXISTS chat_rooms`);
  }
}
