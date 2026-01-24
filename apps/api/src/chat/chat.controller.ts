import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { PaginationParamsDto } from './dto/pagination-params.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { ThreadResponseDto } from './dto/thread-response.dto';
import { MessageResponseDto } from './dto/message-response.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import type { AuthRequest } from '../auth/interfaces/auth-request.interface';

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('threads')
  @Roles(UserRole.MENTOR, UserRole.MENTEE)
  @ApiOperation({
    summary: 'Get user threads',
    description: 'Retrieve all threads for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Threads retrieved successfully',
    type: PaginatedResponseDto,
  })
  async getUserThreads(
    @Req() req: AuthRequest,
    @Query() paginationParams: PaginationParamsDto,
  ) {
    return this.chatService.getUserThreads(req.user.id, paginationParams);
  }

  @Get('threads/:threadId')
  @Roles(UserRole.MENTOR, UserRole.MENTEE)
  @ApiOperation({
    summary: 'Get thread details',
    description: 'Retrieve details of a specific thread',
  })
  @ApiParam({
    name: 'threadId',
    description: 'Thread ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Thread retrieved successfully',
    type: ThreadResponseDto,
  })
  async getThread(
    @Req() req: AuthRequest,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    return this.chatService.getThread(threadId, req.user.id);
  }

  @Get('threads/:threadId/messages')
  @Roles(UserRole.MENTOR, UserRole.MENTEE)
  @ApiOperation({
    summary: 'Get thread messages',
    description: 'Retrieve messages from a specific thread with pagination',
  })
  @ApiParam({
    name: 'threadId',
    description: 'Thread ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    type: PaginatedResponseDto,
  })
  async getThreadMessages(
    @Req() req: AuthRequest,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Query() paginationParams: PaginationParamsDto,
  ) {
    return this.chatService.getThreadMessages(
      threadId,
      req.user.id,
      paginationParams,
    );
  }

  @Post('threads/:threadId/messages')
  @Roles(UserRole.MENTOR, UserRole.MENTEE)
  @ApiOperation({
    summary: 'Send a message',
    description: 'Send a message in a thread',
  })
  @ApiParam({
    name: 'threadId',
    description: 'Thread ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    type: MessageResponseDto,
  })
  async sendMessage(
    @Req() req: AuthRequest,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.chatService.sendMessage(
      threadId,
      req.user.id,
      createMessageDto,
    );
  }

  @Post('threads/:threadId/read')
  @Roles(UserRole.MENTOR, UserRole.MENTEE)
  @ApiOperation({
    summary: 'Mark thread as read',
    description: 'Mark all messages in a thread as read',
  })
  @ApiParam({
    name: 'threadId',
    description: 'Thread ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  async markThreadAsRead(
    @Req() req: AuthRequest,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    await this.chatService.markThreadAsRead(threadId, req.user.id);
    return { message: 'Thread marked as read' };
  }
}
