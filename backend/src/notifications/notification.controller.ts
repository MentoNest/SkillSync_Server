import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import { NotificationQueryDto } from './dto/notification-query.dto.js';
import { UpdateNotificationDto } from './dto/update-notification.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAccessTokenPayload } from '../auth/interfaces/jwt-payload.interface.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(AuthRole.ADMIN)
  async findAll(@Query() query: NotificationQueryDto) {
    return this.notificationService.findAll(query);
  }

  @Get('user/:userId')
  async findByUser(
    @Param('userId') userId: string,
    @Query() query: NotificationQueryDto,
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ) {
    if (req.user.sub !== userId) {
      return this.notificationService.findAll(query);
    }
    return this.notificationService.findByUser(userId, query);
  }

  @Get('unread-count/:userId')
  async getUnreadCount(
    @Param('userId') userId: string,
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ) {
    return this.notificationService.getUnreadCount(userId);
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ) {
    return this.notificationService.markAsRead(id, req.user.sub);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ) {
    await this.notificationService.markAllAsRead(req.user.sub);
    return { message: 'All notifications marked as read' };
  }

  @Post('batch-read')
  @HttpCode(HttpStatus.OK)
  async batchMarkAsRead(
    @Body() body: { ids: string[] },
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ) {
    await this.notificationService.batchMarkAsRead(body.ids, req.user.sub);
    return { message: 'Notifications marked as read' };
  }

  @Delete('cleanup')
  @UseGuards(RolesGuard)
  @Roles(AuthRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async cleanup(@Query('days') days: string) {
    const deletedCount = await this.notificationService.deleteOlderThan(
      parseInt(days, 10) || 30,
    );
    return { deletedCount };
  }
}
