export { MAX_ATTACHMENT_BYTES } from '../common/storage/storage.constants';

export const MESSAGE_RATE_LIMIT = 10;
export const MESSAGE_RATE_WINDOW_MS = 60_000;
export const MAX_MESSAGE_LENGTH = 4000;
export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 100;
export const MAX_SESSION_ID_LENGTH = 128;

export interface ChatAttachment {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

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

export const userChannel = (address: string): string => `user:${address}`;
export const roomChannel = (roomId: string): string => `chat:${roomId}`;
