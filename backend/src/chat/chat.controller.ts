import {
  Controller,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatGateway } from './chat.gateway.js';
import { RolesGuard } from '../guards/roles.guard.js';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(RolesGuard)
@ApiBearerAuth('Bearer Auth')
export class ChatController {
  constructor(private readonly chatGateway: ChatGateway) {}

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get unread message count for current user' })
  async getUnreadCount(@Req() req: Request) {
    const user = (req as any).user;
    const count = await this.chatGateway.getUnreadCount(user.id);
    return { unreadCount: count };
  }

  /**
   * #1362: unread counts grouped by conversation partner, for per-chat badge
   * rendering in the client.
   */
  @Get('unread-counts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get unread message counts grouped by partner' })
  async getUnreadCountsByPartner(@Req() req: Request) {
    const user = (req as any).user;
    const counts = await this.chatGateway.getUnreadCountsByPartner(user.id);
    return { counts };
  }
}
