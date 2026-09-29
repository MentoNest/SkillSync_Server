import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SessionService } from './session.service.js';
import { BookSessionDto, RescheduleSessionDto, CancelSessionDto, RateSessionDto } from './dto/session.dto.js';
import { RolesGuard } from '../guards/roles.guard.js';

@ApiTags('Sessions')
@Controller('sessions')
@UseGuards(RolesGuard)
@ApiBearerAuth('Bearer Auth')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book a new session with a mentor' })
  async bookSession(
    @Body() dto: BookSessionDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.sessionService.bookSession(user.id, dto);
  }

  /**
   * #1363: status workflow — mentor confirms, then completes (or reports a
   * no-show). See also POST :id/cancel below.
   */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a pending session (mentor only)' })
  async confirmSession(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.confirmSession(id, user.id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a confirmed session as completed (mentor only)' })
  async completeSession(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.completeSession(id, user.id);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a participant as a no-show' })
  async markNoShow(@Param('id') id: string, @Body() body: { absenteeId?: string }, @Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.markNoShow(id, user.id, body?.absenteeId ?? user.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a session (24-hour policy enforced)' })
  async cancelSession(
    @Param('id') id: string,
    @Body() dto: CancelSessionDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.sessionService.cancelSession(id, user.id, dto.reason);
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule a session' })
  async rescheduleSession(
    @Param('id') id: string,
    @Body() dto: RescheduleSessionDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.sessionService.rescheduleSession(id, user.id, dto);
  }

  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rate a completed session' })
  async rateSession(
    @Param('id') id: string,
    @Body() dto: RateSessionDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.sessionService.rateSession(id, user.id, dto);
  }

  @Get('mentor')
  @ApiOperation({ summary: 'Get sessions for current mentor' })
  async getMyMentorSessions(@Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.getSessionsByMentor(user.id);
  }

  @Get('mentee')
  @ApiOperation({ summary: 'Get sessions for current mentee' })
  async getMyMenteeSessions(@Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.getSessionsByMentee(user.id);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming sessions' })
  async getUpcomingSessions(@Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.getUpcomingSessions(user.id);
  }

  /**
   * #1363: full session history across both roles (past sessions included).
   */
  @Get('history')
  @ApiOperation({ summary: 'Get full session history for the current user' })
  async getSessionHistory(@Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.getSessionHistory(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session by ID' })
  async getSession(@Param('id') id: string) {
    return this.sessionService.findById(id);
  }
}
