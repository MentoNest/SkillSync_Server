/** Real-time chat (issue #1475). */

/** Messages one user may send per window, across all rooms. */
export const MESSAGE_RATE_LIMIT = 10;
export const MESSAGE_RATE_WINDOW_MS = 60_000;

export const MAX_MESSAGE_LENGTH = 4000;
export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 100;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Allowed attachment types and the extension each is stored under. */
export const ATTACHMENT_MIME_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export interface ChatAttachment {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

/** Socket.io event names shared by the gateway and its clients. */
export const ChatEvents = {
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  SEND_MESSAGE: 'message:send',
  NEW_MESSAGE: 'message:new',
  MARK_READ: 'message:read',
  READ_RECEIPT: 'message:read-receipt',
  TYPING: 'typing',
  PRESENCE: 'presence',
  PRESENCE_QUERY: 'presence:query',
} as const;

/** Socket.io room that every connection of one user joins. */
export const userChannel = (userId: string) => `user:${userId}`;
/** Socket.io room for one chat room. */
export const roomChannel = (roomId: string) => `chat:${roomId}`;
