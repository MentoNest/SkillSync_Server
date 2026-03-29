import { Controller, Delete, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { NotificationService } from './providers/notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('notification')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findAll(@Request() req) {
    return this.notificationService.findAllForUser(req.user.id ?? req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.notificationService.findOneForUser(req.user.id ?? req.user.sub, id);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Request() req) {
    return this.notificationService.markAsRead(req.user.id ?? req.user.sub, id);
  }

  @Patch('read-all')
  markAllAsRead(@Request() req) {
    return this.notificationService.markAllAsRead(req.user.id ?? req.user.sub);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    await this.notificationService.removeForUser(req.user.id ?? req.user.sub, id);
    return { message: 'Notification deleted' };
  }
}
