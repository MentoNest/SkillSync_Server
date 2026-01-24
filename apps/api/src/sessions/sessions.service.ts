import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, SessionStatus } from './entities/session.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';
import { SessionResponseDto } from './dto/session-response.dto';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
  ) {}

  /**
   * Create a session from an accepted booking
   * Called automatically when booking transitions to ACCEPTED status
   * Enforced constraints:
   * - Only creates sessions for ACCEPTED bookings
   * - Session has 1:1 relationship with booking
   * - Session timestamps must match booking times
   * - Session creation is never exposed as a public endpoint
   */
  async createFromBooking(bookingId: string): Promise<SessionResponseDto> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['mentorProfile', 'menteeUser'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.ACCEPTED) {
      throw new BadRequestException(
        'Session can only be created from accepted bookings',
      );
    }

    // Check if session already exists for this booking (unique constraint)
    const existingSession = await this.sessionRepository.findOne({
      where: { bookingId },
    });

    if (existingSession) {
      throw new BadRequestException('Session already exists for this booking');
    }

    // Create session with exact timestamps from booking
    const session = this.sessionRepository.create({
      bookingId: booking.id,
      mentorProfileId: booking.mentorProfileId,
      menteeUserId: booking.menteeUserId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: SessionStatus.SCHEDULED,
    });

    const savedSession = await this.sessionRepository.save(session);
    return this.toResponseDto(savedSession);
  }

  /**
   * Get session by ID with ownership validation
   */
  async findOne(
    id: string,
    userId?: string,
    mentorProfileId?: string,
  ): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['booking', 'mentorProfile', 'menteeUser'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Enforce ownership: user must be either mentor or mentee
    if (userId && session.menteeUserId !== userId) {
      // Not the mentee
      if (mentorProfileId && session.mentorProfileId !== mentorProfileId) {
        // Not the mentor either
        throw new ForbiddenException(
          'You do not have permission to access this session',
        );
      }
    }

    return this.toResponseDto(session);
  }

  /**
   * Start a session (scheduled → in_progress)
   * Allowed for: mentor OR mentee
   */
  async startSession(
    id: string,
    userId: string,
    mentorProfileId?: string,
  ): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['booking', 'mentorProfile', 'menteeUser'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Ownership check: user must be part of the session
    const isMentee = session.menteeUserId === userId;
    const isMentor =
      mentorProfileId && session.mentorProfileId === mentorProfileId;

    if (!isMentee && !isMentor) {
      throw new ForbiddenException(
        'You do not have permission to start this session',
      );
    }

    // State validation: only scheduled sessions can be started
    if (session.status !== SessionStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot start session with status '${session.status}'. Only 'scheduled' sessions can be started.`,
      );
    }

    session.status = SessionStatus.IN_PROGRESS;
    const updatedSession = await this.sessionRepository.save(session);

    return this.toResponseDto(updatedSession);
  }

  /**
   * Complete a session (in_progress → completed)
   * Allowed for: mentor ONLY
   * Triggers completion side-effect hook for future features (reviews, notifications, analytics)
   */
  async completeSession(
    id: string,
    mentorProfileId: string,
  ): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['booking', 'mentorProfile', 'menteeUser'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Ownership check: only the mentor can complete
    if (session.mentorProfileId !== mentorProfileId) {
      throw new ForbiddenException('Only the mentor can complete this session');
    }

    // State validation: only in_progress sessions can be completed
    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot complete session with status '${session.status}'. Only 'in_progress' sessions can be completed.`,
      );
    }

    session.status = SessionStatus.COMPLETED;
    const updatedSession = await this.sessionRepository.save(session);

    // Trigger completion side-effect (stub for future use)
    await this.onSessionCompleted(updatedSession);

    return this.toResponseDto(updatedSession);
  }

  /**
   * Hook: called when session transitions to completed
   * Extensible for future features without modifying the core transition logic
   * Planned extensions:
   * - Review system eligibility
   * - Notification dispatch
   * - Analytics tracking
   * - Webhook dispatch
   */
  private async onSessionCompleted(session: Session): Promise<void> {
    // Stub: prepare for future review eligibility, notifications, etc.
    // This is intentionally minimal and will be extended without touching the core logic
    // Example future implementation:
    // await this.eventBus.emit('session.completed', { sessionId: session.id });
    // await this.reviewsService.unlockReviewEligibility(session.id);
    // await this.notificationsService.notifySessionCompleted(session.menteeUserId);
  }

  /**
   * Get all sessions for a mentee (mentee view)
   */
  async findMenteeSession(
    userId: string,
    sessionId?: string,
  ): Promise<SessionResponseDto[]> {
    const query = this.sessionRepository
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.booking', 'booking')
      .leftJoinAndSelect('session.mentorProfile', 'mentorProfile')
      .leftJoinAndSelect('session.menteeUser', 'menteeUser')
      .where('session.mentee_user_id = :userId', { userId });

    if (sessionId) {
      query.andWhere('session.id = :sessionId', { sessionId });
    }

    const sessions = await query
      .orderBy('session.start_time', 'DESC')
      .getMany();

    if (sessionId && sessions.length === 0) {
      throw new NotFoundException('Session not found');
    }

    return sessions.map((s: Session) => this.toResponseDto(s));
  }

  /**
   * Get all sessions for a mentor (mentor view)
   */
  async findMentorSession(
    mentorProfileId: string,
    sessionId?: string,
  ): Promise<SessionResponseDto[]> {
    const query = this.sessionRepository
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.booking', 'booking')
      .leftJoinAndSelect('session.mentorProfile', 'mentorProfile')
      .leftJoinAndSelect('session.menteeUser', 'menteeUser')
      .where('session.mentor_profile_id = :mentorProfileId', {
        mentorProfileId,
      });

    if (sessionId) {
      query.andWhere('session.id = :sessionId', { sessionId });
    }

    const sessions = await query
      .orderBy('session.start_time', 'DESC')
      .getMany();

    if (sessionId && sessions.length === 0) {
      throw new NotFoundException('Session not found');
    }

    return sessions.map((s: Session) => this.toResponseDto(s));
  }

  /**
   * Convert session entity to response DTO
   */
  private toResponseDto(session: Session): SessionResponseDto {
    return {
      id: session.id,
      bookingId: session.bookingId,
      mentorProfileId: session.mentorProfileId,
      menteeUserId: session.menteeUserId,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      notes: session.notes,
      metadata: session.metadata,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
