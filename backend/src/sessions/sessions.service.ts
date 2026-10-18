import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { AvailabilityService } from '../availability/availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.types';
import { BookSessionDto, QuerySessionsDto } from './dto/session.dto';
import { Session } from './entities/session.entity';
import {
  ACTIVE_STATUSES,
  SessionStatus,
  canTransition,
  findConflict,
  hasCancellationNotice,
  validateSessionWindow,
} from './session-rules';

const PG_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly availability: AvailabilityService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Books a session for `menteeId`. Locks the mentor's calendar while checking for conflicts. */
  async book(menteeId: string, dto: BookSessionDto, now: Date = new Date()): Promise<Session> {
    if (dto.mentorId === menteeId) throw new BadRequestException('You cannot book a session with yourself');

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    const invalid = validateSessionWindow(startTime, endTime, now);
    if (invalid) throw new BadRequestException(invalid);

    if (!(await this.availability.isAvailable(dto.mentorId, startTime))) {
      throw new ConflictException('The mentor is not available at that time');
    }

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        // Pessimistic lock: concurrent bookings for the same mentor queue here.
        const mentorSessions = await this.lockActiveSessions(manager, 'mentor_id', dto.mentorId, startTime, endTime);
        if (findConflict(mentorSessions, { startTime, endTime })) {
          throw new ConflictException('The mentor already has a session at that time');
        }
        const menteeSessions = await this.lockActiveSessions(manager, 'mentee_id', menteeId, startTime, endTime);
        if (findConflict(menteeSessions, { startTime, endTime })) {
          throw new ConflictException('You already have a session at that time');
        }
        return manager.save(
          manager.create(Session, {
            mentorId: dto.mentorId,
            menteeId,
            startTime,
            endTime,
            status: SessionStatus.PENDING,
            notes: dto.notes ?? null,
            meetingUrl: null,
          }),
        );
      });

      await this.notifications?.notify({
        userId: saved.mentorId,
        type: NotificationType.SESSION_REMINDER,
        title: 'New session request',
        body: `A mentee requested a session on ${startTime.toISOString()}.`,
        data: { sessionId: saved.id },
      });
      return saved;
    } catch (err) {
      // The exclusion constraint is the last line of defence against races.
      if ((err as { code?: string }).code === PG_EXCLUSION_VIOLATION) {
        throw new ConflictException('The mentor already has a session at that time');
      }
      throw err;
    }
  }

  private lockActiveSessions(
    manager: EntityManager,
    column: 'mentor_id' | 'mentee_id',
    userId: string,
    start: Date,
    end: Date,
  ): Promise<Session[]> {
    return manager
      .createQueryBuilder(Session, 's')
      .setLock('pessimistic_write')
      .where(`s.${column} = :userId`, { userId })
      .andWhere('s.status IN (:...active)', { active: ACTIVE_STATUSES })
      .andWhere('s.start_time < :end AND s.end_time > :start', { start, end })
      .getMany();
  }

  async findOne(id: string): Promise<Session> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private async transition(session: Session, to: SessionStatus): Promise<Session> {
    if (!canTransition(session.status, to)) {
      throw new BadRequestException(`Cannot move a ${session.status} session to ${to}`);
    }
    session.status = to;
    return this.sessions.save(session);
  }

  async confirm(id: string, mentorId: string): Promise<Session> {
    const session = await this.findOne(id);
    if (session.mentorId !== mentorId) throw new ForbiddenException('Only the mentor can confirm');
    const saved = await this.transition(session, SessionStatus.CONFIRMED);
    await this.notifications?.notify({
      userId: session.menteeId,
      type: NotificationType.SESSION_REMINDER,
      title: 'Session confirmed',
      body: `Your session on ${session.startTime.toISOString()} was confirmed.`,
      data: { sessionId: id },
    });
    return saved;
  }

  async complete(id: string, mentorId: string): Promise<Session> {
    const session = await this.findOne(id);
    if (session.mentorId !== mentorId) throw new ForbiddenException('Only the mentor can complete a session');
    return this.transition(session, SessionStatus.COMPLETED);
  }

  async markNoShow(id: string, mentorId: string): Promise<Session> {
    const session = await this.findOne(id);
    if (session.mentorId !== mentorId) throw new ForbiddenException('Only the mentor can mark a no-show');
    return this.transition(session, SessionStatus.NO_SHOW);
  }

  /**
   * Cancels a session. Either party must give 24 hours' notice for a
   * confirmed session; pending requests can be withdrawn at any time. Admins
   * can always cancel (`isAdmin`).
   */
  async cancel(
    id: string,
    userId: string,
    reason: string | undefined,
    isAdmin = false,
    now: Date = new Date(),
  ): Promise<Session> {
    const session = await this.findOne(id);
    const isParty = session.mentorId === userId || session.menteeId === userId;
    if (!isParty && !isAdmin) throw new ForbiddenException('You are not part of this session');

    if (
      !isAdmin &&
      session.status === SessionStatus.CONFIRMED &&
      !hasCancellationNotice(session.startTime, now)
    ) {
      throw new ForbiddenException('Confirmed sessions need at least 24 hours notice to cancel');
    }

    session.cancelledBy = userId;
    session.cancelledAt = now;
    session.cancellationReason = reason ?? null;
    const saved = await this.transition(session, SessionStatus.CANCELLED);

    const otherParty = userId === session.mentorId ? session.menteeId : session.mentorId;
    await this.notifications?.notify({
      userId: otherParty,
      type: NotificationType.SESSION_REMINDER,
      title: 'Session cancelled',
      body: `The session on ${session.startTime.toISOString()} was cancelled.`,
      data: { sessionId: id },
    });
    return saved;
  }

  /** Session history for a mentor or mentee, newest first. */
  async history(userId: string, query: QuerySessionsDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const qb = this.sessions
      .createQueryBuilder('s')
      .where(new Brackets((w) => w.where('s.mentor_id = :userId').orWhere('s.mentee_id = :userId')), { userId })
      .orderBy('s.start_time', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  /** The mentee rates a completed session once. */
  async rate(id: string, menteeId: string, rating: number, review?: string): Promise<Session> {
    const session = await this.findOne(id);
    if (session.menteeId !== menteeId) throw new ForbiddenException('Only the mentee can rate a session');
    if (session.status !== SessionStatus.COMPLETED) {
      throw new BadRequestException('Only completed sessions can be rated');
    }
    if (session.rating !== null) throw new ConflictException('This session was already rated');
    session.rating = rating;
    session.review = review ?? null;
    return this.sessions.save(session);
  }

  /** Reminder placeholder: marks sessions starting within 24h and notifies both parties. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendDueReminders(now: Date = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + 24 * 3_600_000);
    const due = await this.sessions
      .createQueryBuilder('s')
      .where('s.status = :status', { status: SessionStatus.CONFIRMED })
      .andWhere('s.reminder_sent_at IS NULL')
      .andWhere('s.start_time > :now AND s.start_time <= :horizon', { now, horizon })
      .getMany();

    for (const session of due) {
      for (const userId of [session.mentorId, session.menteeId]) {
        await this.notifications?.notify({
          userId,
          type: NotificationType.SESSION_REMINDER,
          title: 'Session starts within 24 hours',
          body: `Your session starts at ${session.startTime.toISOString()}.`,
          data: { sessionId: session.id },
        });
      }
      session.reminderSentAt = now;
      await this.sessions.save(session);
    }
    if (due.length) this.logger.log(`Sent reminders for ${due.length} session(s)`);
    return due.length;
  }
}
