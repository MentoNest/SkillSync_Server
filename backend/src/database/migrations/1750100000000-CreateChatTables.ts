import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreateChatTables
 *
 * Creates the real-time messaging infrastructure:
 *   mentorship_sessions  — one record per mentor/mentee pairing
 *   chat_rooms           — one room per session (1-to-1 with sessions)
 *   messages             — persisted chat messages with read-receipt support
 *   message_attachments  — file attachments linked to messages
 *
 * Indexes are tuned for:
 *   - Conversation history retrieval (room_id + created_at)
 *   - Unread-count queries          (room_id + is_read + sender_id)
 *   - Participant lookup             (mentor_id / mentee_id)
 */
export class CreateChatTables1750100000000 implements MigrationInterface {
  name = 'CreateChatTables1750100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── mentorship_sessions ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mentorship_sessions" (
        "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
        "mentor_id"           UUID          NOT NULL,
        "mentee_id"           UUID          NOT NULL,
        "status"              VARCHAR(20)   NOT NULL DEFAULT 'active'
                                            CHECK (status IN ('active', 'completed', 'cancelled')),
        "contract_session_id" VARCHAR(256),
        "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_mentorship_sessions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mentorship_sessions_mentor"
        ON "mentorship_sessions" ("mentor_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mentorship_sessions_mentee"
        ON "mentorship_sessions" ("mentee_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mentorship_sessions_pair"
        ON "mentorship_sessions" ("mentor_id", "mentee_id")
    `);

    // ── chat_rooms ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_rooms" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "session_id"  UUID        NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_chat_rooms"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_rooms_session_id"   UNIQUE ("session_id"),
        CONSTRAINT "FK_chat_rooms_session"
          FOREIGN KEY ("session_id")
          REFERENCES "mentorship_sessions" ("id")
          ON DELETE CASCADE
      )
    `);

    // ── messages ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
        "room_id"       UUID        NOT NULL,
        "sender_id"     UUID        NOT NULL,
        "content"       TEXT,
        "message_type"  VARCHAR(20) NOT NULL DEFAULT 'text'
                                    CHECK (message_type IN ('text', 'file', 'system')),
        "is_read"       BOOLEAN     NOT NULL DEFAULT FALSE,
        "read_at"       TIMESTAMPTZ,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_messages_room"
          FOREIGN KEY ("room_id")
          REFERENCES "chat_rooms" ("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_messages_room_created"
        ON "messages" ("room_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_messages_sender"
        ON "messages" ("sender_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_messages_unread"
        ON "messages" ("room_id", "is_read", "sender_id")
        WHERE is_read = FALSE
    `);

    // ── message_attachments ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "message_attachments" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "message_id"  UUID,
        "file_name"   VARCHAR(512)  NOT NULL,
        "file_url"    VARCHAR(2048) NOT NULL,
        "file_size"   BIGINT        NOT NULL,
        "mime_type"   VARCHAR(128)  NOT NULL,
        "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_message_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_message_attachments_message"
          FOREIGN KEY ("message_id")
          REFERENCES "messages" ("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_message_attachments_message"
        ON "message_attachments" ("message_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "message_attachments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_rooms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mentorship_sessions"`);
  }
}
