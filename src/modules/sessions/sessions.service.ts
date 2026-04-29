import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, MoreThan } from 'typeorm';
import { Session, SessionStatus } from './entities/session.entity';
import { User } from '../auth/entities/user.entity';
import { AvailabilitySlot, AvailabilityException } from '../availability/entities/availability.entity';
import {
  CreateSessionDto,
  CancelSessionDto,
  RescheduleSessionDto,
  RateSessionDto,
  SessionQueryDto,
} from './dto/session.dto';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AvailabilitySlot)
    private availabilitySlotRepository: Repository<AvailabilitySlot>,
    @InjectRepository(AvailabilityException)
    private availabilityExceptionRepository: Repository<AvailabilityException>,
    private dataSource: DataSource,
  ) {}

  /**
   * Book a new session with a mentor
   */
  async bookSession(menteeId: string, createSessionDto: CreateSessionDto): Promise<Session> {
    const { mentorId, startTime, endTime, notes } = createSessionDto;

    // Use transaction with locking to prevent double-booking
    return await this.dataSource.transaction(async (transactionalEntityManager) => {
      // Verify mentor exists
      const mentor = await transactionalEntityManager.findOne(User, {
        where: { id: mentorId },
      });
      if (!mentor) {
        throw new NotFoundException('Mentor not found');
      }

      // Verify mentee exists
      const mentee = await transactionalEntityManager.findOne(User, {
        where: { id: menteeId },
      });
      if (!mentee) {
        throw new NotFoundException('Mentee not found');
      }

      // Validate session times
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (start >= end) {
        throw new BadRequestException('End time must be after start time');
      }

      if (start <= new Date()) {
        throw new BadRequestException('Session start time must be in the future');
      }

      // Check for booking conflicts with database lock
      const hasConflict = await this.checkBookingConflict(
        mentorId,
        start,
        end,
        transactionalEntityManager,
      );

      if (hasConflict) {
        throw new BadRequestException('Time slot is already booked or conflicts with another session');
      }

      // Check mentor availability
      const isAvailable = await this.checkMentorAvailability(mentorId, start, end);
      if (!isAvailable) {
        throw new BadRequestException('Mentor is not available during the requested time slot');
      }

      // Create the session
      const session = transactionalEntityManager.create(Session, {
        mentorId,
        menteeId,
        startTime: start,
        endTime: end,
        status: SessionStatus.PENDING,
        notes,
      });

      const savedSession = await transactionalEntityManager.save(session);

      // TODO: Send notification to mentor (email/WebSocket placeholder)
      // await this.notificationService.sendBookingNotification(mentor, savedSession);

      return savedSession;
    });
  }

  /**
   * Check for booking conflicts
   */
  async checkBookingConflict(
    mentorId: string,
    startTime: Date,
    endTime: Date,
    entityManager?: any,
  ): Promise<boolean> {
    const repo = entityManager || this.sessionRepository;

    // Check for overlapping sessions (pending, confirmed, or completed)
    const conflictingSessions = await repo.find(Session, {
      where: [
        {
          mentorId,
          status: SessionStatus.PENDING,
        },
        {
          mentorId,
          status: SessionStatus.CONFIRMED,
        },
        {
          mentorId,
          status: SessionStatus.COMPLETED,
        },
      ],
    });

    // Check if any session overlaps with the requested time
    const hasOverlap = conflictingSessions.some((session) => {
      return startTime < session.endTime && endTime > session.startTime;
    });

    return hasOverlap;
  }

  /**
   * Check if mentor is available during the requested time
   */
  private async checkMentorAvailability(
    mentorId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    const dayOfWeek = startTime.getUTCDay();
    const startHours = startTime.getUTCHours();
    const startMinutes = startTime.getUTCMinutes();
    const endHours = endTime.getUTCHours();
    const endMinutes = endTime.getUTCMinutes();

    const startTimeStr = `${String(startHours).padStart(2, '0')}:${String(startMinutes).padStart(2, '0')}`;
    const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

    // Check if there's an availability exception for this date
    const dateStr = startTime.toISOString().split('T')[0];
    const exception = await this.availabilityExceptionRepository.findOne({
      where: {
        mentorId,
        exceptionDate: dateStr,
      },
    });

    // If exception exists and blocks the time slot
    if (exception) {
      if (!exception.startTime || !exception.endTime) {
        // Full day blocked
        return false;
      }

      const exceptionStart = exception.startTime;
      const exceptionEnd = exception.endTime;

      if (startTimeStr >= exceptionStart && endTimeStr <= exceptionEnd) {
        return true; // Time slot is within exception allowed time
      }
      return false;
    }

    // Check regular availability slots
    const availabilitySlot = await this.availabilitySlotRepository.findOne({
      where: {
        mentorId,
        dayOfWeek,
        isActive: true,
      },
    });

    if (!availabilitySlot) {
      return false; // No availability set for this day
    }

    // Check if requested time falls within availability slot
    if (
      startTimeStr >= availabilitySlot.startTime &&
      endTimeStr <= availabilitySlot.endTime
    ) {
      return true;
    }

    return false;
  }

  /**
   * Cancel a session with 24-hour policy enforcement
   */
  async cancelSession(
    userId: string,
    sessionId: string,
    cancelDto: CancelSessionDto,
  ): Promise<Session> {
    return await this.dataSource.transaction(async (transactionalEntityManager) => {
      const session = await transactionalEntityManager.findOne(Session, {
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException('Session not found');
      }

      // Only mentor or mentee can cancel
      if (session.mentorId !== userId && session.menteeId !== userId) {
        throw new ForbiddenException('You can only cancel your own sessions');
      }

      // Cannot cancel already cancelled or completed sessions
      if (
        session.status === SessionStatus.CANCELLED ||
        session.status === SessionStatus.COMPLETED
      ) {
        throw new BadRequestException('Cannot cancel a completed or already cancelled session');
      }

      // Check 24-hour cancellation policy
      const hoursUntilSession = (session.startTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
      
      if (hoursUntilSession < 24 && hoursUntilSession > 0) {
        // TODO: Apply penalty or warning (placeholder)
        // await this.penaltyService.applyLateCancellationPenalty(userId, session);
        console.warn(`Late cancellation by ${userId} for session ${sessionId} (less than 24 hours notice)`);
      }

      // Update session status
      session.status = SessionStatus.CANCELLED;
      session.cancelledAt = new Date();
      session.cancellationReason = cancelDto.reason || 'Cancelled by user';

      const updatedSession = await transactionalEntityManager.save(session);

      // TODO: Send cancellation notification
      // const otherUserId = session.mentorId === userId ? session.menteeId : session.mentorId;
      // await this.notificationService.sendCancellationNotification(otherUserId, updatedSession);

      return updatedSession;
    });
  }

  /**
   * Reschedule a session
   */
  async rescheduleSession(
    userId: string,
    sessionId: string,
    rescheduleDto: RescheduleSessionDto,
  ): Promise<Session> {
    return await this.dataSource.transaction(async (transactionalEntityManager) => {
      const session = await transactionalEntityManager.findOne(Session, {
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException('Session not found');
      }

      // Only mentor or mentee can reschedule
      if (session.mentorId !== userId && session.menteeId !== userId) {
        throw new ForbiddenException('You can only reschedule your own sessions');
      }

      // Cannot reschedule cancelled or completed sessions
      if (
        session.status === SessionStatus.CANCELLED ||
        session.status === SessionStatus.COMPLETED
      ) {
        throw new BadRequestException('Cannot reschedule a completed or cancelled session');
      }

      const newStartTime = new Date(rescheduleDto.startTime);
      const newEndTime = new Date(rescheduleDto.endTime);

      // Validate new times
      if (newStartTime >= newEndTime) {
        throw new BadRequestException('End time must be after start time');
      }

      if (newStartTime <= new Date()) {
        throw new BadRequestException('Session start time must be in the future');
      }

      // Check for conflicts with new time
      const hasConflict = await this.checkBookingConflict(
        session.mentorId,
        newStartTime,
        newEndTime,
        transactionalEntityManager,
      );

      if (hasConflict) {
        throw new BadRequestException('New time slot conflicts with another session');
      }

      // Check mentor availability for new time
      const isAvailable = await this.checkMentorAvailability(
        session.mentorId,
        newStartTime,
        newEndTime,
      );

      if (!isAvailable) {
        throw new BadRequestException('Mentor is not available during the new time slot');
      }

      // Update session times
      session.startTime = newStartTime;
      session.endTime = newEndTime;
      session.status = SessionStatus.PENDING; // Reset to pending for reconfirmation

      const updatedSession = await transactionalEntityManager.save(session);

      // TODO: Send reschedule notification
      // const otherUserId = session.mentorId === userId ? session.menteeId : session.mentorId;
      // await this.notificationService.sendRescheduleNotification(otherUserId, updatedSession);

      return updatedSession;
    });
  }

  /**
   * Confirm a session (mentor only)
   */
  async confirmSession(userId: string, sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Only mentor can confirm
    if (session.mentorId !== userId) {
      throw new ForbiddenException('Only the mentor can confirm the session');
    }

    if (session.status !== SessionStatus.PENDING) {
      throw new BadRequestException('Only pending sessions can be confirmed');
    }

    session.status = SessionStatus.CONFIRMED;
    return await this.sessionRepository.save(session);
  }

  /**
   * Rate and review a completed session
   */
  async rateSession(
    userId: string,
    sessionId: string,
    rateDto: RateSessionDto,
  ): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Only mentee can rate
    if (session.menteeId !== userId) {
      throw new ForbiddenException('Only the mentee can rate the session');
    }

    if (session.status !== SessionStatus.COMPLETED) {
      throw new BadRequestException('Can only rate completed sessions');
    }

    session.rating = rateDto.rating;
    session.review = rateDto.review || null;

    // TODO: Update mentor's average rating
    // await this.mentorService.updateAverageRating(session.mentorId);

    return await this.sessionRepository.save(session);
  }

  /**
   * Get session by ID
   */
  async getSessionById(userId: string, sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['mentor', 'mentee'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Only participants can view the session
    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('You can only view your own sessions');
    }

    return session;
  }

  /**
   * Get sessions for a user (mentor or mentee)
   */
  async getUserSessions(
    userId: string,
    query: SessionQueryDto,
    role: 'mentor' | 'mentee',
  ): Promise<{ sessions: Session[]; total: number }> {
    const { status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const whereCondition: any = {};
    whereCondition[role === 'mentor' ? 'mentorId' : 'menteeId'] = userId;

    if (status) {
      whereCondition.status = status;
    }

    const [sessions, total] = await this.sessionRepository.findAndCount({
      where: whereCondition,
      relations: ['mentor', 'mentee'],
      order: { startTime: 'DESC' },
      skip,
      take: limit,
    });

    return { sessions, total };
  }

  /**
   * Get mentee's session history
   */
  async getMenteeHistory(menteeId: string, query: SessionQueryDto): Promise<{ sessions: Session[]; total: number }> {
    return this.getUserSessions(menteeId, query, 'mentee');
  }

  /**
   * Get mentor's session history
   */
  async getMentorHistory(mentorId: string, query: SessionQueryDto): Promise<{ sessions: Session[]; total: number }> {
    return this.getUserSessions(mentorId, query, 'mentor');
  }

  /**
   * Mark session as no-show (mentor only)
   */
  async markNoShow(userId: string, sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Only mentor can mark no-show
    if (session.mentorId !== userId) {
      throw new ForbiddenException('Only the mentor can mark a session as no-show');
    }

    if (session.status !== SessionStatus.CONFIRMED) {
      throw new BadRequestException('Can only mark confirmed sessions as no-show');
    }

    session.status = SessionStatus.NO_SHOW;
    return await this.sessionRepository.save(session);
  }

  /**
   * Mark session as completed (mentor only)
   */
  async markCompleted(userId: string, sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Only mentor can mark as completed
    if (session.mentorId !== userId) {
      throw new ForbiddenException('Only the mentor can mark a session as completed');
    }

    if (session.status !== SessionStatus.CONFIRMED) {
      throw new BadRequestException('Can only mark confirmed sessions as completed');
    }

    session.status = SessionStatus.COMPLETED;
    return await this.sessionRepository.save(session);
  }

  /**
   * Add meeting URL to session
   */
  async addMeetingUrl(
    userId: string,
    sessionId: string,
    meetingUrl: string,
  ): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Only mentor or mentee can add meeting URL
    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('You can only update your own sessions');
    }

    session.meetingUrl = meetingUrl;
    return await this.sessionRepository.save(session);
  }
}
