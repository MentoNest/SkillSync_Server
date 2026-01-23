import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { Notification } from "./entities/notification.entity";

@WebSocketGateway({
  cors: {
    origin: "*", // Configure appropriately for production
  },
  namespace: "/notifications",
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private userSocketMap = new Map<string, Set<string>>(); // userId -> Set of socket IDs

  /**
   * Handle client connection
   * Expects client to send userId via auth or query params
   */
  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);

    if (!userId) {
      this.logger.warn(`Client ${client.id} connected without userId`);
      client.disconnect();
      return;
    }

    // Track socket for this user
    if (!this.userSocketMap.has(userId)) {
      this.userSocketMap.set(userId, new Set());
    }
    this.userSocketMap.get(userId)!.add(client.id);

    // Join user-specific room
    client.join(`user:${userId}`);
    this.logger.log(`Client ${client.id} connected for user ${userId}`);
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(client: Socket) {
    const userId = this.extractUserId(client);

    if (userId) {
      const sockets = this.userSocketMap.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSocketMap.delete(userId);
        }
      }
      this.logger.log(`Client ${client.id} disconnected for user ${userId}`);
    }
  }

  /**
   * Push notification to specific user
   */
  pushToUser(userId: string, notification: Notification) {
    this.server.to(`user:${userId}`).emit("notification", notification);
    this.logger.log(`Pushed notification ${notification.id} to user ${userId}`);
  }

  /**
   * Broadcast unread count update to user
   */
  pushUnreadCount(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit("unreadCount", { count });
  }

  /**
   * Extract userId from socket connection
   * Can be customized based on your auth strategy
   */
  private extractUserId(client: Socket): string | null {
    // Option 1: From query params
    const userIdFromQuery = client.handshake.query.userId as string;
    if (userIdFromQuery) return userIdFromQuery;

    // Option 2: From auth token (if using JWT)
    // const token = client.handshake.auth.token;
    // Decode and validate token, return userId

    // Option 3: From headers
    // const userId = client.handshake.headers['x-user-id'];
    // return userId;

    return null;
  }
}
