import { Injectable } from '@nestjs/common';

/**
 * Online status by open socket count, so a user with two tabs stays online
 * until the last one closes. In-memory: per process.
 */
@Injectable()
export class ChatPresence {
  private readonly connections = new Map<string, number>();

  /** Records a connection; true when the user just came online. */
  connect(userId: string): boolean {
    const count = (this.connections.get(userId) ?? 0) + 1;
    this.connections.set(userId, count);
    return count === 1;
  }

  /** Records a disconnect; true when the user just went offline. */
  disconnect(userId: string): boolean {
    const count = (this.connections.get(userId) ?? 0) - 1;
    if (count > 0) {
      this.connections.set(userId, count);
      return false;
    }
    return this.connections.delete(userId);
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }
}
