import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatPresence {
  private readonly connections = new Map<string, number>();

  connect(address: string): boolean {
    const count = (this.connections.get(address) ?? 0) + 1;
    this.connections.set(address, count);
    return count === 1;
  }

  disconnect(address: string): boolean {
    const count = (this.connections.get(address) ?? 0) - 1;
    if (count > 0) {
      this.connections.set(address, count);
      return false;
    }
    return this.connections.delete(address);
  }

  isOnline(address: string): boolean {
    return this.connections.has(address);
  }
}
