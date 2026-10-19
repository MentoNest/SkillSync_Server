import { MigrationInterface, QueryRunner } from 'typeorm';

/** Issue #1475: chat rooms per mentorship pairing and their messages. */
export class CreateChat1700000073000 implements MigrationInterface {
  name = 'CreateChat1700000073000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "chat_rooms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mentor_id" uuid NOT NULL,
        "mentee_id" uuid NOT NULL,
        "last_message_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_rooms_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chat_rooms_pair" UNIQUE ("mentor_id", "mentee_id"),
        CONSTRAINT "FK_chat_rooms_mentor" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_rooms_mentee" FOREIGN KEY ("mentee_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_rooms_mentee" ON "chat_rooms" ("mentee_id")`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "room_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "body" text NOT NULL DEFAULT '',
        "attachments" jsonb NOT NULL DEFAULT '[]',
        "read_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_messages_room" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    // Conversation history, newest first.
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_messages_room_created" ON "chat_messages" ("room_id", "created_at")`);
    // Unread counts and read receipts.
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chat_messages_room_unread" ON "chat_messages" ("room_id", "sender_id", "read_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "chat_messages"`);
    await q.query(`DROP TABLE IF EXISTS "chat_rooms"`);
  }
}
