import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import { Session, SessionStatus } from './session.entity.js';
import { User } from '../user/entities/user.entity.js';
import { AvailabilitySlot } from '../entities/availability-slot.entity.js';
import {
  NotificationChannel,
  NotificationType,
} from '../entities/notification.entity.js';
import { NotificationService } from '../services/notification.service.js';
import { BookSessionDto, RescheduleSessionDto, RateSessionDto } from './dto/session.dto.js';

/**
 * #1363: session scheduling system.
 *
 * Design notes:
 *  - Booking runs inside a transaction that takes `SELECT ... FOR UPDATE` row
 *    locks on the two participants (locked in sorted order to avoid
 *    deadlocks), then re-checks overlap. Two concurrent overlapping bookings
 *    can therefore never both succeed ("prevent double-booking with database
 *    locks").
 *  - Status workflow: pending -> confirmed -> completed, with cancelled and
 *    no_show terminal states, all guarded against illegal transitions.
 *  - Cancellations honour the 24-hour policy: inside the window the platform
 *    refuses; outside it the actor, reason and penalty flag are recorded.
 *  - Reminders and lifecycle notifications go through the shared notification
 *    system (#1364); email/push remain placeholder channels there.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly CANCELLATION_WINDOW_HOURS = 24;
  private readonly MIN_BOOKING_NOTICE_HOURS = 1;

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AvailabilitySlot)
    private readonly availabilityRepository: Repository<AvailabilitySlot>,
    private readonly dataSource: DataSource,
    private readonly notifier: NotificationService,
  ) {}

  /**
   * Book a session. Validation, then a transaction that locks both
   * participants' user rows before re-checking overlap — closing the
   * check-then-insert race.
   */
  async bookSession(menteeId: string, dto: BookSessionDto): Promise<Session> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    const earliest = new Date(Date.now() + this.MIN_BOOKING_NOTICE_HOURS * 60 * 60 * 1000);
    if (startTime < earliest) {
      throw new BadRequestException(
        `Sessions must be booked at least ${this.MIN_BOOKING_NOTICE_HOURS} hour(s) in advance`,
      );
    }

    const maxHorizon = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    if (startTime > maxHorizon) {
      throw new BadRequestException('Sessions cannot be booked more than a year ahead');
    }

    if (dto.mentorId === menteeId) {
      throw new BadRequestException('You cannot book a session with yourself');
    }

    const mentor = await this.userRepository.findOne({ where: { id: dto.mentorId } });
    if (!mentor) {
      throw new NotFoundException('Mentor not found');
    }

    return this.dataSource.transaction(async (manager) => {
      const lockedRepo = manager.getRepository(Session);

      // #1363: database locks. Deterministic (sorted) lock order prevents
      // deadlocks between two users booking each other simultaneously.
      const ids = [dto.mentorId, menteeId].sort();
      for (const id of ids) {
        await manager.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id]);
      }

      const hasConflict = await this.hasActiveOverlap(
        lockedRepo,
        dto.mentorId,
        startTime,
        endTime,
      );
      if (hasConflict) {
        throw new ConflictException('Mentor is not available during this time slot');
      }

      const menteeConflict = await this.hasActiveOverlap(lockedRepo, menteeId, startTime, endTime);
      if (menteeConflict) {
        throw new ConflictException('You already have a session during this time slot');
      }

      const session = await lockedRepo.save(
        lockedRepo.create({
          mentorId: dto.mentorId,
          menteeId,
          startTime,
          endTime,
          meetingUrl: dto.meetingUrl ?? null,
          notes: dto.notes ?? null,
          status: SessionStatus.PENDING,
        }),
      );

      await this.notifySessionEvent(session, 'booked');
      return session;
    });
  }

  /**
   * Confirm a pending session (mentor-side action).
   */
  async confirmSession(sessionId: string, userId: string): Promise<Session> {
    const session = await this.findById(sessionId);

    if (session.mentorId !== userId) {
      throw new ForbiddenException('Only the mentor can confirm a session');
    }
    if (session.status !== SessionStatus.PENDING) {
      throw new BadRequestException('Only pending sessions can be confirmed');
    }

    session.status = SessionStatus.CONFIRMED;
    session.confirmedAt = new Date();
    const saved = await this.sessionRepository.save(session);

    await this.notifySessionEvent(saved, 'confirmed');
    return saved;
  }

  /**
   * Mark a confirmed session as completed once its scheduled end has passed.
   */
  async completeSession(sessionId: string, userId: string): Promise<Session> {
    const session = await this.findById(sessionId);

    if (session.mentorId !== userId) {
      throw new ForbiddenException('Only the mentor can complete a session');
    }
    if (session.status !== SessionStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed sessions can be completed');
    }
    if (new Date(session.endTime).getTime() > Date.now()) {
      throw new BadRequestException('Session end time has not passed yet');
    }

    session.status = SessionStatus.COMPLETED;
    session.completedAt = new Date();
    const saved = await this.sessionRepository.save(session);

    await this.notifySessionEvent(saved, 'completed');
    return saved;
  }

  /**
   * Report a no-show. Either participant can file it against the other.
   */
  async markNoShow(sessionId: string, userId: string, absenteeId: string): Promise<Session> {
    const session = await this.findById(sessionId);

    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('Only session participants can report a no-show');
    }
    if (absenteeId !== session.mentorId && absenteeId !== session.menteeId) {
      throw new BadRequestException('Absentee must be a session participant');
    }
    if (session.status !== SessionStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed sessions can be marked as no-show');
    }

    session.status = SessionStatus.NO_SHOW;
    return this.sessionRepository.save(session);
  }

  /**
   * Cancel a session, enforcing the 24-hour policy ("cancel up to 24 hours
   * before without penalty"): inside the window the cancellation is refused,
   * outside it the actor/reason are recorded (penalty flag false by
   * definition here, kept for the payments integration).
   */
  async cancelSession(sessionId: string, userId: string, reason?: string): Promise<Session> {
    const session = await this.findById(sessionId);

    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('You can only cancel your own sessions');
    }

    if (session.status === SessionStatus.CANCELLED) {
      throw new BadRequestException('Session is already cancelled');
    }
    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed session');
    }
    if (session.status === SessionStatus.NO_SHOW) {
      throw new BadRequestException('Cannot cancel a no-show session');
    }

    const hoursUntilStart =
      (new Date(session.startTime).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilStart < this.CANCELLATION_WINDOW_HOURS) {
      throw new BadRequestException(
        `Sessions must be cancelled at least ${this.CANCELLATION_WINDOW_HOURS} hours before the start time`,
      );
    }

    session.status = SessionStatus.CANCELLED;
    session.cancelledBy = userId;
    session.cancellationReason = reason ?? null;
    session.cancellationPenaltyApplied = false;

    const saved = await this.sessionRepository.save(session);
    await this.notifySessionEvent(saved, 'cancelled');
    return saved;
  }

  /**
   * Reschedule a pending or confirmed session (it returns to pending for
   * re-confirmation). Overlap is re-checked inside the same locked
   * transaction as booking.
   */
  async rescheduleSession(
    sessionId: string,
    userId: string,
    dto: RescheduleSessionDto,
  ): Promise<Session> {
    const session = await this.findById(sessionId);

    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('You can only reschedule your own sessions');
    }
    if (session.status !== SessionStatus.PENDING && session.status !== SessionStatus.CONFIRMED) {
      throw new BadRequestException('Only pending or confirmed sessions can be rescheduled');
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }
    if (startTime <= new Date()) {
      throw new BadRequestException('New time must be in the future');
    }

    return this.dataSource.transaction(async (manager) => {
      const lockedRepo = manager.getRepository(Session);

      const ids = [session.mentorId, session.menteeId].sort();
      for (const id of ids) {
        await manager.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id]);
      }

      // Exclude the session being moved from its own overlap check.
      const mentorConflict = await this.hasActiveOverlap(
        lockedRepo,
        session.mentorId,
        startTime,
        endTime,
        sessionId,
      );
      if (mentorConflict) {
        throw new ConflictException('Mentor is not available during this time slot');
      }

      const menteeConflict = await this.hasActiveOverlap(
        lockedRepo,
        session.menteeId,
        startTime,
        endTime,
        sessionId,
      );
      if (menteeConflict) {
        throw new ConflictException('You already have a session during this time slot');
      }

      session.startTime = startTime;
      session.endTime = endTime;
      session.status = SessionStatus.PENDING;
      session.confirmedAt = null;

      const saved = await lockedRepo.save(session);
      await this.notifySessionEvent(saved, 'rescheduled');
      return saved;
    });
  }

  /**
   * Rate a completed session (mentee-side): 1..5 plus optional review.
   */
  async rateSession(sessionId: string, userId: string, dto: RateSessionDto): Promise<Session> {
    const session = await this.findById(sessionId);

    if (session.menteeId !== userId) {
      throw new ForbiddenException('Only the mentee can rate a session');
    }
    if (session.status !== SessionStatus.COMPLETED) {
      throw new BadRequestException('Can only rate completed sessions');
    }
    if (session.rating !== null) {
      throw new BadRequestException('Session has already been rated');
    }

    session.rating = dto.rating;
    session.review = dto.review ?? null;

    return this.sessionRepository.save(session);
  }

  async getSessionsByMentor(mentorId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { mentorId },
      relations: { mentee: true },
      order: { startTime: 'DESC' },
    });
  }

  async getSessionsByMentee(menteeId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { menteeId },
      relations: { mentor: true },
      order: { startTime: 'DESC' },
    });
  }

  /**
   * Upcoming (pending/confirmed) sessions for a user, either side.
   */
  async getUpcomingSessions(userId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: [
        { mentorId: userId, status: SessionStatus.PENDING, startTime: MoreThanOrEqual(new Date()) },
        { menteeId: userId, status: SessionStatus.PENDING, startTime: MoreThanOrEqual(new Date()) },
        { mentorId: userId, status: SessionStatus.CONFIRMED, startTime: MoreThanOrEqual(new Date()) },
        { menteeId: userId, status: SessionStatus.CONFIRMED, startTime: MoreThanOrEqual(new Date()) },
      ],
      order: { startTime: 'ASC' },
    });
  }

  /**
   * Full session history for either role, newest first ("session history for
   * both mentors and mentees").
   */
  async getSessionHistory(userId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: [{ mentorId: userId }, { menteeId: userId }],
      relations: { mentor: true, mentee: true },
      order: { startTime: 'DESC' },
    });
  }

  /**
   * #1363: check a candidate window against the mentor's weekly recurring
   * availability slots (#1169). Mentors without declared slots accept any
   * window (the overlap checks still apply).
   */
  async isMentorAvailable(mentorId: string, startTime: Date, endTime: Date): Promise<boolean> {
    const slots = await this.availabilityRepository.find({
      where: { mentorId, dayOfWeek: startTime.getUTCDay() },
    });

    if (slots.length === 0) {
      return true;
    }

    const startMinutes = startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
    const endMinutes = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();

    return slots.some((slot) => {
      const [sh, sm] = slot.startTime.split(':').map(Number);
      const [eh, em] = slot.endTime.split(':').map(Number);
      return startMinutes >= sh * 60 + sm && endMinutes <= eh * 60 + em;
    });
  }

  /**
   * #1363: reminder sweep for confirmed sessions starting within the next 24
   * hours. `reminderSentAt` keeps it idempotent; wire a scheduler to call it
   * hourly. Delivery rides the notification system's email/push placeholders.
   */
  async sendDueReminders(): Promise<number> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const due = await this.sessionRepository
      .createQueryBuilder('session')
      .where('session.status = :status', { status: SessionStatus.CONFIRMED })
      .andWhere('session.startTime >= :now', { now })
      .andWhere('session.startTime <= :horizon', { horizon })
      .andWhere('session.reminderSentAt IS NULL')
      .getMany();

    let sent = 0;
    for (const session of due) {
      const message = `Your session starts at ${session.startTime.toISOString()}`;
      try {
        await Promise.all([
          this.notifier.create({
            userId: session.menteeId,
            type: NotificationType.SESSION,
            title: 'Session reminder',
            message,
            channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
          }),
          this.notifier.create({
            userId: session.mentorId,
            type: NotificationType.SESSION,
            title: 'Session reminder',
            message,
            channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
          }),
        ]);
      } catch (error) {
        this.logger.warn(
          `Reminder delivery failed for session ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      session.reminderSentAt = new Date();
      await this.sessionRepository.save(session);
      sent += 1;
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} session reminder(s)`);
    }
    return sent;
  }

  async findById(id: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: { mentor: true, mentee: true },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  /**
   * Overlap check against active sessions for a user. Callers that need
   * race-safety run this inside the locked transaction (booking/reschedule).
   */
  private async hasActiveOverlap(
    repo: Repository<Session>,
    userId: string,
    startTime: Date,
    endTime: Date,
    excludeSessionId?: string,
  ): Promise<boolean> {
    const qb = repo
      .createQueryBuilder('session')
      .where('(session.mentorId = :userId OR session.menteeId = :userId)', { userId })
      .andWhere('session.status IN (:...statuses)', {
        statuses: [SessionStatus.PENDING, SessionStatus.CONFIRMED],
      })
      .andWhere('session.startTime < :endTime AND session.endTime > :startTime', {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });

    if (excludeSessionId) {
      qb.andWhere('session.id != :excludeId', { excludeId: excludeSessionId });
    }

    return (await qb.getCount()) > 0;
  }

  /**
   * Fan out a lifecycle event to both participants via the notification
   * system. Best effort: failures are logged, never propagated.
   */
  private async notifySessionEvent(
    session: Session,
    event: 'booked' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled',
  ): Promise<void> {
    const messages: Record<typeof event, string> = {
      booked: `A session was booked for ${session.startTime.toISOString()}`,
      confirmed: `Your session on ${session.startTime.toISOString()} was confirmed`,
      completed: `Your session on ${session.startTime.toISOString()} was completed`,
      cancelled: `Your session on ${session.startTime.toISOString()} was cancelled`,
      rescheduled: `Your session was moved to ${session.startTime.toISOString()} and needs re-confirmation`,
    };

    const base = {
      type: NotificationType.SESSION,
      title: `Session ${event}`,
      message: messages[event],
      metadata: { sessionId: session.id, event },
    };

    try {
      await Promise.all([
        this.notifier.create({ userId: session.mentorId, ...base }),
        this.notifier.create({ userId: session.menteeId, ...base }),
      ]);
    } catch (error) {
      this.logger.warn(
        `Session notification fan-out failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
