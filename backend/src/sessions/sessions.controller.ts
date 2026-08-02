import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SessionsService } from './sessions.service.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { UpdateSessionDto } from './dto/update-session.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SessionStatus } from './entities/enums/session-status.enum.js';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createSession(@Body() dto: CreateSessionDto, @Req() req: any) {
    return this.sessionsService.bookSession(dto, req.user.sub);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelSession(@Param('id') id: string, @Req() req: any) {
    return this.sessionsService.cancelSession(id, req.user.sub);
  }

  @Patch(':id/reschedule')
  @UseGuards(JwtAuthGuard)
  async rescheduleSession(
    @Param('id') id: string,
    @Body() dto: CreateSessionDto,
    @Req() req: any,
  ) {
    return this.sessionsService.rescheduleSession(id, dto, req.user.sub);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard)
  async completeSession(@Param('id') id: string, @Req() req: any) {
    return this.sessionsService.completeSession(id, req.user.sub);
  }

  @Post(':id/rate')
  @UseGuards(JwtAuthGuard)
  async rateSession(
    @Param('id') id: string,
    @Body() body: { rating: number; review?: string },
    @Req() req: any,
  ) {
    return this.sessionsService.rateSession(id, body, req.user.sub);
  }

  @Get('mentor/:mentorId')
  async getMentorSessions(
    @Param('mentorId') mentorId: string,
    @Query() query: { page?: number; limit?: number; status?: SessionStatus },
  ) {
    return this.sessionsService.getMentorSessions(mentorId, query);
  }

  @Get('mentee/:menteeId')
  @UseGuards(JwtAuthGuard)
  async getMenteeSessions(
    @Param('menteeId') menteeId: string,
    @Query() query: { page?: number; limit?: number; status?: SessionStatus },
  ) {
    return this.sessionsService.getMenteeSessions(menteeId, query);
  }
}
