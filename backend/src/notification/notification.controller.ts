import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  NotificationPreferenceResponseDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-preferences.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { Notification } from './notification.entity';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth('******')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'List my notifications',
    operationId: 'listNotifications',
  })
  @ApiResponse({ status: HttpStatus.OK })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationQueryDto,
  ): ReturnType<NotificationService['list']> {
    return this.notifications.list(user.address, query);
  }

  @Patch('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a batch of notifications as read',
    operationId: 'markNotificationsRead',
  })
  @ApiResponse({ status: HttpStatus.OK, schema: { example: { updated: 2 } } })
  markManyRead(
    @CurrentUser() user: AuthUser,
    @Body() dto: MarkNotificationsReadDto,
  ): Promise<{ updated: number }> {
    return this.notifications.markManyRead(user.address, dto.ids);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark one notification as read',
    operationId: 'markNotificationRead',
  })
  @ApiResponse({ status: HttpStatus.OK, type: Notification })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Notification> {
    return this.notifications.markRead(user.address, id);
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Get my notification preferences',
    operationId: 'getNotificationPreferences',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: NotificationPreferenceResponseDto,
    isArray: true,
  })
  getPreferences(
    @CurrentUser() user: AuthUser,
  ): Promise<NotificationPreferenceResponseDto[]> {
    return this.notifications.getPreferences(user.address);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update my notification preferences',
    operationId: 'updateNotificationPreferences',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: NotificationPreferenceResponseDto,
    isArray: true,
  })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferenceResponseDto[]> {
    return this.notifications.updatePreferences(user.address, dto.preferences);
  }
}
