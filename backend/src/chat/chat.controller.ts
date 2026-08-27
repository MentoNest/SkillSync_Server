import {
  Controller,
  Get,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatGateway } from './chat.gateway';
import { RolesGuard } from '../guards/roles.guard';

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
}
