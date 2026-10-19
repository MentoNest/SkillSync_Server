import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { MAX_ATTACHMENT_BYTES } from './chat.types';
import { AttachmentCaptionDto, OpenRoomDto, QueryMessagesDto } from './dto/chat.dto';

/** REST side of chat: rooms, history, unread counts and file attachments. */
@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  @Post('rooms')
  @ApiOperation({ summary: 'Open (or fetch) the chat room with a mentor or mentee' })
  openRoom(@CurrentUser('sub') userId: string, @Body() dto: OpenRoomDto) {
    return this.chat.openRoom(userId, dto.participantId);
  }

  @Get('rooms')
  listRooms(@CurrentUser('sub') userId: string) {
    return this.chat.listRooms(userId);
  }

  @Get('rooms/:id/messages')
  history(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) roomId: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.chat.history(userId, roomId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread message count, in total and per room' })
  unreadCount(@CurrentUser('sub') userId: string) {
    return this.chat.unreadCounts(userId);
  }

  @Patch('rooms/:id/read')
  async markRead(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) roomId: string) {
    const receipt = await this.chat.markRead(userId, roomId);
    this.gateway.broadcastReadReceipt(receipt);
    return receipt;
  }

  @Post('rooms/:id/attachments')
  @ApiOperation({ summary: 'Send an image or document (max 10MB) as a message' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' }, body: { type: 'string' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  async sendAttachment(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) roomId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AttachmentCaptionDto,
  ) {
    const { message, recipientId } = await this.chat.sendAttachment(userId, roomId, file, dto.body);
    this.gateway.broadcastMessage(message, recipientId);
    return message;
  }
}
