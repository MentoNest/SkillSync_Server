import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './notification.entity';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth('******')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/notifications')
export class NotificationAdminController {
  constructor(private readonly notifications: NotificationService) {}

  @Post('announcements')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Broadcast a platform announcement',
    operationId: 'adminBroadcastAnnouncement',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      example: { recipients: 120, delivered: 118, optedOut: 1, rateLimited: 1 },
    },
  })
  broadcastAnnouncement(@Body() dto: CreateAnnouncementDto): Promise<{
    recipients: number;
    delivered: number;
    optedOut: number;
    rateLimited: number;
  }> {
    return this.notifications.broadcastAnnouncement(dto);
  }

  @Post(':userId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a notification to a user',
    operationId: 'adminCreateNotification',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: Notification })
  createForUser(
    @Param('userId') userId: string,
    @Body() dto: CreateNotificationDto,
  ): Promise<Notification | null> {
    return this.notifications.createForUser(userId, dto);
  }
}
