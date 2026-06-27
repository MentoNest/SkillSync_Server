import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { RateSessionDto } from './dto/rate-session.dto';
import { SessionHistoryQueryDto } from './dto/session-history-query.dto';

@ApiTags('Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  bookSession(@Body() dto: CreateSessionDto, @Request() req: any) {
    return this.sessionsService.bookSession(dto, req.user.sub);
  }

  @Patch(':id/confirm')
  confirmSession(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.confirmSession(id, req.user.sub);
  }

  @Patch(':id/cancel')
  cancelSession(
    @Param('id') id: string,
    @Body() dto: CancelSessionDto,
    @Request() req: any,
  ) {
    return this.sessionsService.cancelSession(id, req.user.sub);
  }

  @Patch(':id/reschedule')
  rescheduleSession(
    @Param('id') id: string,
    @Body() dto: RescheduleSessionDto,
    @Request() req: any,
  ) {
    return this.sessionsService.rescheduleSession(id, req.user.sub, dto);
  }

  @Patch(':id/rate')
  rateSession(
    @Param('id') id: string,
    @Body() dto: RateSessionDto,
    @Request() req: any,
  ) {
    return this.sessionsService.rateSession(id, req.user.sub, dto);
  }

  @Get()
  getHistory(@Query() query: SessionHistoryQueryDto, @Request() req: any) {
    return this.sessionsService.getHistory(req.user.sub, query.status);
  }

  @Get(':id')
  getSession(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.getSession(id, req.user.sub);
  }
}
