import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { SessionResponseDto } from './dto/session-response.dto';
import { MentorGuard } from '../guards/auth/mentor.guard';
import { CurrentMentorProfile } from '../decorators/auth/current-mentor-profile.decorator';
import { CurrentUser } from '../decorators/auth/current-user.decorator';

/**
 * Session Management Controller
 *
 * Handles session lifecycle transitions and retrieval.
 * Implements strict RBAC enforcement:
 * - Mentee: Can start sessions (scheduled → in_progress) and view their own sessions
 * - Mentor: Can start and complete sessions, view their own sessions
 *
 * Session Lifecycle: scheduled → in_progress → completed
 *
 * Key Invariants:
 * - Sessions are created only from accepted bookings (automatic, not via API)
 * - Sessions have 1:1 relationship with bookings
 * - Sessions cannot be created, updated (except transitions), or deleted via API
 * - Only mentor can complete a session
 * - Timestamps always match their source booking
 */
@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * Start a session (scheduled → in_progress)
   * Accessible by both mentee and mentor via different auth methods
   */
  @Patch(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start a session',
    description:
      'Transition session from scheduled to in_progress. Available to mentee or mentor participating in the session.',
  })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({
    status: 200,
    description: 'Session started successfully',
    type: SessionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not session participant' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition - session not in scheduled state',
  })
  async startSession(
    @Param('id') id: string,
    @Optional() @CurrentUser() userId?: string,
    @Optional() @CurrentMentorProfile() mentorProfileId?: string,
  ): Promise<SessionResponseDto> {
    if (!userId && !mentorProfileId) {
      throw new UnauthorizedException('User ID or Mentor Profile ID required');
    }

    return this.sessionsService.startSession(id, userId || '', mentorProfileId);
  }

  /**
   * Complete a session (in_progress → completed)
   * Mentor-only operation
   * Triggers session completion side-effects (future: reviews, notifications, analytics)
   */
  @Patch(':id/complete')
  @UseGuards(MentorGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a session (mentor only)',
    description:
      'Transition session from in_progress to completed. Only the session mentor can complete. Unlocks review eligibility and triggers notifications.',
  })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({
    status: 200,
    description: 'Session completed successfully',
    type: SessionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only mentor can complete',
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition - session not in in_progress state',
  })
  async completeSession(
    @Param('id') id: string,
    @CurrentMentorProfile() mentorProfileId: string,
  ): Promise<SessionResponseDto> {
    return this.sessionsService.completeSession(id, mentorProfileId);
  }

  /**
   * Get mentee's sessions
   * Returns all sessions where the current user is the mentee
   */
  @Get('mentee/my-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get mentee's sessions",
    description: 'Retrieve all sessions where the current user is the mentee',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessions retrieved successfully',
    type: [SessionResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMySessionsMentee(
    @CurrentUser() userId: string,
  ): Promise<SessionResponseDto[]> {
    return this.sessionsService.findMenteeSession(userId);
  }

  /**
   * Get mentor's sessions
   * Returns all sessions where the current mentor is the mentor
   */
  @Get('mentor/my-sessions')
  @UseGuards(MentorGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get mentor's sessions",
    description: 'Retrieve all sessions where the current mentor is the mentor',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessions retrieved successfully',
    type: [SessionResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMySessionsMentor(
    @CurrentMentorProfile() mentorProfileId: string,
  ): Promise<SessionResponseDto[]> {
    return this.sessionsService.findMentorSession(mentorProfileId);
  }

  /**
   * Get a specific session (mentee view)
   * Mentee can only access sessions they participate in
   */
  @Get('mentee/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get session details (mentee)',
    description: 'Retrieve details of a specific session (mentee perspective)',
  })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({
    status: 200,
    description: 'Session retrieved successfully',
    type: SessionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSessionMentee(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<SessionResponseDto> {
    const sessions = await this.sessionsService.findMenteeSession(userId, id);
    if (sessions.length === 0) {
      throw new BadRequestException('Session not found or access denied');
    }
    return sessions[0];
  }

  /**
   * Get a specific session (mentor view)
   * Mentor can only access sessions they participate in
   */
  @Get('mentor/:id')
  @UseGuards(MentorGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get session details (mentor)',
    description: 'Retrieve details of a specific session (mentor perspective)',
  })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({
    status: 200,
    description: 'Session retrieved successfully',
    type: SessionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSessionMentor(
    @Param('id') id: string,
    @CurrentMentorProfile() mentorProfileId: string,
  ): Promise<SessionResponseDto> {
    const sessions = await this.sessionsService.findMentorSession(
      mentorProfileId,
      id,
    );
    if (sessions.length === 0) {
      throw new BadRequestException('Session not found or access denied');
    }
    return sessions[0];
  }
}
