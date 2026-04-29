import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import {
  CreateSessionDto,
  CancelSessionDto,
  RescheduleSessionDto,
  RateSessionDto,
  SessionQueryDto,
} from './dto/session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Book a new session with a mentor' })
  @ApiResponse({ status: 201, description: 'Session successfully booked' })
  @ApiResponse({ status: 400, description: 'Booking conflict or invalid time slot' })
  async bookSession(@Request() req, @Body() createSessionDto: CreateSessionDto) {
    const menteeId = req.user.id;
    return this.sessionsService.bookSession(menteeId, createSessionDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session details by ID' })
  @ApiResponse({ status: 200, description: 'Session details retrieved' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(@Request() req, @Param('id') id: string) {
    return this.sessionsService.getSessionById(req.user.id, id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all sessions for current user' })
  @ApiResponse({ status: 200, description: 'List of sessions retrieved' })
  async getMySessions(
    @Request() req,
    @Query() query: SessionQueryDto,
    @Query('role') role: 'mentor' | 'mentee',
  ) {
    return this.sessionsService.getUserSessions(req.user.id, query, role || 'mentee');
  }

  @Get('mentor/history')
  @ApiOperation({ summary: 'Get mentor session history' })
  @ApiResponse({ status: 200, description: 'Mentor session history retrieved' })
  async getMentorHistory(@Request() req, @Query() query: SessionQueryDto) {
    return this.sessionsService.getMentorHistory(req.user.id, query);
  }

  @Get('mentee/history')
  @ApiOperation({ summary: 'Get mentee session history' })
  @ApiResponse({ status: 200, description: 'Mentee session history retrieved' })
  async getMenteeHistory(@Request() req, @Query() query: SessionQueryDto) {
    return this.sessionsService.getMenteeHistory(req.user.id, query);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirm a pending session (mentor only)' })
  @ApiResponse({ status: 200, description: 'Session confirmed' })
  @ApiResponse({ status: 403, description: 'Only mentor can confirm' })
  async confirmSession(@Request() req, @Param('id') id: string) {
    return this.sessionsService.confirmSession(req.user.id, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a session' })
  @ApiResponse({ status: 200, description: 'Session cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed session' })
  async cancelSession(
    @Request() req,
    @Param('id') id: string,
    @Body() cancelDto: CancelSessionDto,
  ) {
    return this.sessionsService.cancelSession(req.user.id, id, cancelDto);
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule a session' })
  @ApiResponse({ status: 200, description: 'Session rescheduled' })
  @ApiResponse({ status: 400, description: 'Time slot conflict' })
  async rescheduleSession(
    @Request() req,
    @Param('id') id: string,
    @Body() rescheduleDto: RescheduleSessionDto,
  ) {
    return this.sessionsService.rescheduleSession(req.user.id, id, rescheduleDto);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark session as completed (mentor only)' })
  @ApiResponse({ status: 200, description: 'Session marked as completed' })
  async completeSession(@Request() req, @Param('id') id: string) {
    return this.sessionsService.markCompleted(req.user.id, id);
  }

  @Patch(':id/no-show')
  @ApiOperation({ summary: 'Mark session as no-show (mentor only)' })
  @ApiResponse({ status: 200, description: 'Session marked as no-show' })
  async markNoShow(@Request() req, @Param('id') id: string) {
    return this.sessionsService.markNoShow(req.user.id, id);
  }

  @Patch(':id/rate')
  @ApiOperation({ summary: 'Rate and review a completed session (mentee only)' })
  @ApiResponse({ status: 200, description: 'Session rated successfully' })
  @ApiResponse({ status: 400, description: 'Can only rate completed sessions' })
  async rateSession(
    @Request() req,
    @Param('id') id: string,
    @Body() rateDto: RateSessionDto,
  ) {
    return this.sessionsService.rateSession(req.user.id, id, rateDto);
  }

  @Patch(':id/meeting-url')
  @ApiOperation({ summary: 'Add meeting URL to session' })
  @ApiResponse({ status: 200, description: 'Meeting URL added' })
  async addMeetingUrl(
    @Request() req,
    @Param('id') id: string,
    @Body('meetingUrl') meetingUrl: string,
  ) {
    return this.sessionsService.addMeetingUrl(req.user.id, id, meetingUrl);
  }
}
