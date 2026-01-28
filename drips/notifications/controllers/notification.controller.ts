import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
//   UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationService } from '../services/notification.service';
import {
  ListNotificationsQueryDto,
  PaginatedNotificationsResponseDto,
  NotificationResponseDto,
} from '../dto/notification.dto';
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@Controller('notifications')
// @UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'List user notifications',
    description:
      'Retrieve paginated list of notifications for the authenticated user with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    type: PaginatedNotificationsResponseDto,
  })
  @ApiQuery({ name: 'read', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['booking_accepted', 'session_upcoming', 'payment_released'],
  })
  async list(
    @Request() req,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<PaginatedNotificationsResponseDto> {
    return this.notificationService.list(req.user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description:
      'Get the count of unread notifications for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', example: 5 },
      },
    },
  })
  async getUnreadCount(@Request() req): Promise<{ count: number }> {
    const count = await this.notificationService.getUnreadCount(req.user.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description:
      'Mark a single notification as read. Only the owner can mark their notifications.',
  })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
    type: NotificationResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - not the owner' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @Request() req,
    @Param('id') id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationService.markAsRead(id, req.user.id);
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description:
      'Mark all unread notifications for the authenticated user as read',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
    schema: {
      type: 'object',
      properties: {
        updated: { type: 'number', example: 12 },
      },
    },
  })
  async markAllAsRead(@Request() req): Promise<{ updated: number }> {
    return this.notificationService.markAllAsRead(req.user.id);
  }
}
