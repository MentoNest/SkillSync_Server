import { MigrationInterface, QueryRunner, Table, TableIndex, TableColumnOptions } from 'typeorm';

/**
 * #1362 / #1363 / #1364: chat, scheduling and notifications storage.
 *
 * Creates the physical tables backing the entities introduced with these
 * features (entities stay the single source of truth):
 *  - `sessions`                — mentorship session lifecycle (#1363)
 *  - `chat_messages`           — persisted chat history (#1362)
 *  - `notifications`           — in-app notification rows (#1364)
 *  - `notification_preferences`— per-user opt-outs (#1364)
 *
 * All timestamps are `timestamptz` with `now()` defaults; UUID primary keys
 * use `uuid_generate_v4()` like the earlier migrations in this codebase.
 */
export class CreateChatSessionNotificationTables1725000000022 implements MigrationInterface {
  name = 'CreateChatSessionNotificationTables1725000000022';

  private static readonly UUID_PK: TableColumnOptions = {
    name: 'id',
    type: 'uuid',
    isPrimary: true,
    isGenerated: true,
    generationStrategy: 'uuid',
    default: 'uuid_generate_v4()',
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createSessions(queryRunner);
    await this.createChatMessages(queryRunner);
    await this.createNotifications(queryRunner);
    await this.createNotificationPreferences(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notification_preferences', true);
    await queryRunner.dropTable('notifications', true);
    await queryRunner.dropTable('chat_messages', true);
    await queryRunner.dropTable('sessions', true);
    // The extension is intentionally left installed on downgrade; dropping it
    // could break other objects that came to depend on it.
  }

  // ─── sessions (#1363) ───────────────────────────────────────────────────

  private async createSessions(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sessions',
        columns: [
          CreateChatSessionNotificationTables1725000000022.UUID_PK,
          { name: 'mentorId', type: 'uuid', isNullable: false },
          { name: 'menteeId', type: 'uuid', isNullable: false },
          { name: 'startTime', type: 'timestamptz', isNullable: false },
          { name: 'endTime', type: 'timestamptz', isNullable: false },
          {
            name: 'status',
            type: 'enum',
            enumName: 'sessions_status_enum',
            enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
            default: "'pending'",
          },
          { name: 'meetingUrl', type: 'varchar', length: '500', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'rating', type: 'int', isNullable: true },
          { name: 'review', type: 'text', isNullable: true },
          { name: 'confirmedAt', type: 'timestamptz', isNullable: true },
          { name: 'completedAt', type: 'timestamptz', isNullable: true },
          { name: 'cancelledBy', type: 'uuid', isNullable: true },
          { name: 'cancellationReason', type: 'text', isNullable: true },
          { name: 'cancellationPenaltyApplied', type: 'boolean', default: false },
          { name: 'reminderSentAt', type: 'timestamptz', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
        foreignKeys: [
          {
            name: 'FK_sessions_mentor',
            columnNames: ['mentorId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_sessions_mentee',
            columnNames: ['menteeId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    const sessionIndexes: Array<[string, string[]]> = [
      ['IDX_sessions_mentor', ['mentorId']],
      ['IDX_sessions_mentee', ['menteeId']],
      ['IDX_sessions_status', ['status']],
      ['IDX_sessions_startTime', ['startTime']],
      // Reminder sweep: status + start time + un-reminded lookups.
      ['IDX_sessions_reminder_sweep', ['status', 'startTime', 'reminderSentAt']],
    ];
    for (const [name, columns] of sessionIndexes) {
      await queryRunner.createIndex('sessions', new TableIndex({ name, columnNames: columns }));
    }

    // #1363: defence-in-depth exclusion constraints — no two active sessions
    // may overlap for the same participant even if application checks are
    // bypassed. Requires the `btree_gist` extension (created if absent).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD CONSTRAINT "EX_sessions_no_overlap_mentor"
      EXCLUDE USING gist (
        "mentorId" WITH =,
        tsrange("startTime", "endTime") WITH &&
      ) WHERE (status IN ('pending', 'confirmed'))
    `);
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD CONSTRAINT "EX_sessions_no_overlap_mentee"
      EXCLUDE USING gist (
        "menteeId" WITH =,
        tsrange("startTime", "endTime") WITH &&
      ) WHERE (status IN ('pending', 'confirmed'))
    `);
  }

  // ─── chat_messages (#1362) ──────────────────────────────────────────────

  private async createChatMessages(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'chat_messages',
        columns: [
          CreateChatSessionNotificationTables1725000000022.UUID_PK,
          { name: 'senderId', type: 'uuid', isNullable: false },
          { name: 'receiverId', type: 'uuid', isNullable: false },
          { name: 'sessionId', type: 'uuid', isNullable: true },
          { name: 'content', type: 'text', isNullable: false },
          { name: 'isRead', type: 'boolean', default: false },
          { name: 'fileUrl', type: 'varchar', length: '500', isNullable: true },
          { name: 'fileType', type: 'varchar', length: '100', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
        ],
        foreignKeys: [
          {
            name: 'FK_chat_messages_sender',
            columnNames: ['senderId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_chat_messages_receiver',
            columnNames: ['receiverId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_chat_messages_session',
            columnNames: ['sessionId'],
            referencedTableName: 'sessions',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    const chatIndexes: Array<[string, string[]]> = [
      ['IDX_chat_messages_sender', ['senderId']],
      ['IDX_chat_messages_receiver', ['receiverId']],
      ['IDX_chat_messages_session', ['sessionId']],
      // Conversation history: newest first within a session, read/unread scans.
      ['IDX_chat_messages_session_createdAt', ['sessionId', 'createdAt']],
      ['IDX_chat_messages_receiver_unread', ['receiverId', 'isRead']],
    ];
    for (const [name, columns] of chatIndexes) {
      await queryRunner.createIndex('chat_messages', new TableIndex({ name, columnNames: columns }));
    }
  }

  // ─── notifications (#1364) ──────────────────────────────────────────────

  private async createNotifications(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          CreateChatSessionNotificationTables1725000000022.UUID_PK,
          { name: 'userId', type: 'uuid', isNullable: false },
          {
            name: 'type',
            type: 'enum',
            enumName: 'notifications_type_enum',
            enum: ['system', 'mentorship', 'session', 'payment', 'achievement', 'reminder', 'warning'],
          },
          {
            name: 'priority',
            type: 'enum',
            enumName: 'notifications_priority_enum',
            enum: ['low', 'medium', 'high', 'urgent'],
            default: "'medium'",
          },
          { name: 'title', type: 'varchar', length: '255', isNullable: false },
          { name: 'message', type: 'text', isNullable: false },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'read', type: 'boolean', default: false },
          { name: 'readAt', type: 'timestamptz', isNullable: true },
          { name: 'actionUrl', type: 'varchar', length: '500', isNullable: true },
          { name: 'icon', type: 'varchar', length: '100', isNullable: true },
          {
            name: 'channels',
            type: 'jsonb',
            default: `'[\"in_app\"]'::jsonb`,
          },
          { name: 'expiresAt', type: 'timestamptz', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
        foreignKeys: [
          {
            name: 'FK_notifications_user',
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    const notificationIndexes: Array<[string, string[]]> = [
      ['IDX_notifications_userId_read', ['userId', 'read']],
      ['IDX_notifications_createdAt', ['createdAt']],
      ['IDX_notifications_userId_type', ['userId', 'type']],
      ['IDX_notifications_expiresAt', ['expiresAt']],
    ];
    for (const [name, columns] of notificationIndexes) {
      await queryRunner.createIndex(
        'notifications',
        new TableIndex({ name, columnNames: columns }),
      );
    }
  }

  // ─── notification_preferences (#1364) ───────────────────────────────────

  private async createNotificationPreferences(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notification_preferences',
        columns: [
          CreateChatSessionNotificationTables1725000000022.UUID_PK,
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'disabledChannels', type: 'jsonb', default: `'[]'::jsonb` },
          { name: 'disabledTypes', type: 'jsonb', default: `'[]'::jsonb` },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
        foreignKeys: [
          {
            name: 'FK_notification_preferences_user',
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'notification_preferences',
      new TableIndex({
        name: 'IDX_notification_preferences_userId',
        columnNames: ['userId'],
        isUnique: true,
      }),
    );
  }
}
