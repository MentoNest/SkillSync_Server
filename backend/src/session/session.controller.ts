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
import { SessionService } from './session.service';
import { BookSessionDto, RescheduleSessionDto, CancelSessionDto, RateSessionDto } from './dto/session.dto';
import { RolesGuard } from '../guards/roles.guard';

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

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a session' })
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

  @Get(':id')
  @ApiOperation({ summary: 'Get session by ID' })
  async getSession(@Param('id') id: string) {
    return this.sessionService.findById(id);
  }
}
