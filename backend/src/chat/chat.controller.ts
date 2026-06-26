import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { JwtAccessTokenPayload } from '../jwt-payload.interface';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Create a mentorship session and its chat room' })
  async createSession(@Body() dto: CreateSessionDto, @Request() req: { user: JwtAccessTokenPayload }) {
    return this.chatService.createSession(dto.mentorId, dto.menteeId, dto.contractSessionId);
  }

  @Get('rooms')
  @ApiOperation({ summary: 'List all chat rooms for the authenticated user' })
  async getUserRooms(@Request() req: { user: JwtAccessTokenPayload }) {
    return this.chatService.getUserRoomsWithDetails(req.user.sub);
  }

  @Get('rooms/:roomId/messages')
  @ApiOperation({ summary: 'Get paginated message history for a room' })
  @ApiParam({ name: 'roomId', type: 'string' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'before', required: false, type: 'string', description: 'Message ID cursor for pagination' })
  async getMessages(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('before') before: string | undefined,
    @Request() req: { user: JwtAccessTokenPayload },
  ) {
    const hasAccess = await this.chatService.userHasRoomAccess(req.user.sub, roomId);
    if (!hasAccess) throw new BadRequestException('Access denied');

    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    return this.chatService.getMessageHistory(roomId, clampedLimit, before);
  }

  @Get('rooms/:roomId/unread')
  @ApiOperation({ summary: 'Get unread message count for a room' })
  @ApiParam({ name: 'roomId', type: 'string' })
  async getUnreadCount(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Request() req: { user: JwtAccessTokenPayload },
  ) {
    const count = await this.chatService.getUnreadCount(roomId, req.user.sub);
    return { roomId, unreadCount: count };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file attachment for a chat message (max 10 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'chat'),
        filename: (_req, file, cb) => {
          const unique = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');

    const baseUrl = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const fileUrl = `${baseUrl}/uploads/chat/${file.filename}`;

    const attachment = await this.chatService.storeAttachmentRecord({
      fileName: file.originalname,
      fileUrl,
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    return {
      id: attachment.id,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
    };
  }
}
