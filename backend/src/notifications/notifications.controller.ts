import { Body, Controller, Get, MessageEvent, Param, ParseUUIDPipe, Patch, Put, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { MarkReadDto, QueryNotificationsDto, SetPreferenceDto } from './dto/notification.dto';
import { NotificationBus } from './notification-bus';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly bus: NotificationBus,
  ) {}

  @Get()
  list(@CurrentUser('sub') userId: string, @Query() query: QueryNotificationsDto) {
    return this.notifications.list(userId, query);
  }

  /** Real-time delivery: Server-Sent Events stream of new notifications. */
  @Sse('stream')
  stream(@CurrentUser('sub') userId: string): Observable<MessageEvent> {
    return this.bus.stream(userId).pipe(map((notification) => ({ data: notification })));
  }

  @Get('preferences')
  preferences(@CurrentUser('sub') userId: string) {
    return this.notifications.getPreferences(userId);
  }

  @Put('preferences')
  async setPreference(@CurrentUser('sub') userId: string, @Body() dto: SetPreferenceDto) {
    await this.notifications.setPreference(userId, dto.type, dto.enabled);
    return this.notifications.getPreferences(userId);
  }

  @Patch('read')
  markMany(@CurrentUser('sub') userId: string, @Body() dto: MarkReadDto) {
    return this.notifications.markManyRead(userId, dto.ids);
  }

  @Patch('read-all')
  markAll(@CurrentUser('sub') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Patch(':id/read')
  markOne(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(userId, id);
  }
}
