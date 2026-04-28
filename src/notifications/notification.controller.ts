import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  getUserNotifications(@Query('userId') userId: string, @Query() q) {
    return this.service.getNotifications(userId, q.page, q.limit);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markAsRead(id);
  }

  @Patch('read-all/:userId')
  markAllRead(@Param('userId') userId: string) {
    return this.service.markAllAsRead(userId);
  }
}