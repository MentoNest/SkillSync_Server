import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AUTH_CONFIG, AuthConfig, JwtPayload } from '../auth/auth.types';
import { Notification } from './notification.entity';

@WebSocketGateway({ namespace: '/notifications' })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token = this.getAccessToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.authConfig.jwtSecret,
      });
      if (payload.type !== 'access' || !payload.sub || !payload.jti) {
        client.disconnect(true);
        return;
      }
      if (await this.auth.isRevoked(payload.jti)) {
        client.disconnect(true);
        return;
      }
      client.data.userId = payload.sub;
      await client.join(this.userRoom(payload.sub));
    } catch {
      this.logger.debug('Rejected an unauthenticated notification socket');
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() _client: Socket): void {}

  emitToUser(userId: string, notification: Notification): void {
    this.server.to(this.userRoom(userId)).emit('notification', notification);
  }

  private getAccessToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) return authToken;

    const authorization = client.handshake.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return undefined;
    return authorization.slice('Bearer '.length);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }
}
