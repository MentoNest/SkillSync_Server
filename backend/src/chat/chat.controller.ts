import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { MAX_ATTACHMENT_BYTES } from './chat.types';
import {
  AttachmentCaptionDto,
  OpenRoomDto,
  QueryMessagesDto,
} from './dto/chat.dto';

@ApiTags('Chat')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  @Post('rooms')
  @ApiOperation({
    summary: 'Open (or fetch) the chat room for a mentorship session',
  })
  openRoom(@Body() dto: OpenRoomDto, @CurrentUser() user: AuthUser) {
    return this.chat.openRoom(user, dto.sessionId, dto.participantId);
  }

  @Get('rooms')
  @ApiOperation({ summary: 'List the current user chat rooms' })
  listRooms(@CurrentUser() user: AuthUser) {
    return this.chat.listRooms(user.address);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({ summary: 'Page through room history, newest first' })
  @ApiParam({ name: 'id', description: 'Chat room UUID' })
  history(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) roomId: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.chat.history(user.address, roomId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread message count, in total and per room' })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.chat.unreadCounts(user.address);
  }

  @Patch('rooms/:id/read')
  @ApiOperation({
    summary: 'Mark the other participant messages in a room as read',
  })
  @ApiParam({ name: 'id', description: 'Chat room UUID' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) roomId: string,
  ) {
    const receipt = await this.chat.markRead(user.address, roomId);
    this.gateway.broadcastReadReceipt(receipt);
    return receipt;
  }

  @Post('rooms/:id/attachments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send an image or document (max 10MB) as a message',
  })
  @ApiParam({ name: 'id', description: 'Chat room UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        body: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }),
  )
  async sendAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) roomId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AttachmentCaptionDto,
  ) {
    const { message, recipientId } = await this.chat.sendAttachment(
      user.address,
      roomId,
      file,
      dto.body,
    );
    this.gateway.broadcastMessage(message, recipientId);
    return message;
  }
}
