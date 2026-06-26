import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from '../jwt-auth.guard';
import { JwtAccessTokenPayload } from '../jwt-payload.interface';
import { MarkReadDto } from './dto/mark-read.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findForUser(
    @Req() req: Request & { user: JwtAccessTokenPayload },
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.notificationsService.findForUser(
      req.user.sub,
      Number(page),
      Number(limit),
    );
  }

  @Post('read')
  async markRead(
    @Req() req: Request & { user: JwtAccessTokenPayload },
    @Body() body: MarkReadDto,
  ) {
    await this.notificationsService.markRead(req.user.sub, body.ids);
    return { success: true };
  }

  @Delete('cleanup')
  async cleanup() {
    const deleted = await this.notificationsService.deleteOlderThan90Days();
    return { deleted };
  }
}
