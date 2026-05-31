import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendMessageDto, GetMessagesDto, ReadReceiptDto } from './dto/chat.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getUserSessions(@Request() req: { user: JwtPayload }) {
    return this.chatService.getUserSessions(req.user.sub);
  }

  @Post('messages')
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Request() req: { user: JwtPayload },
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(dto.sessionId, req.user.sub, dto.content, dto.fileUrl, dto.fileName, dto.fileType);
  }

  @Post('messages/read')
  @UseGuards(JwtAuthGuard)
  async markAsRead(
    @Request() req: { user: JwtPayload },
    @Body() dto: ReadReceiptDto,
  ) {
    return this.chatService.markAsRead(dto.messageId, req.user.sub);
  }

  @Get('messages/unread-count')
  @UseGuards(JwtAuthGuard)
  async getUnreadCount(
    @Request() req: { user: JwtPayload },
    @Body() dto: { sessionId: string },
  ) {
    return this.chatService.getUnreadCount(req.user.sub, dto.sessionId);
  }

  @Get('messages')
  @UseGuards(JwtAuthGuard)
  async getMessages(
    @Request() req: { user: JwtPayload },
    @Body() dto: GetMessagesDto,
  ) {
    return this.chatService.getMessages(dto.sessionId, req.user.sub, dto.limit, dto.offset);
  }
}