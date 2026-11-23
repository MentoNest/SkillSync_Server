import {
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { AvailabilityService } from '../availability/availability.service';
import {
  BusinessRuleException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../common/errors/app-exceptions';
import type { PaginatedResponse } from '../common/pagination/pagination.interface';
import { PaginationService } from '../common/pagination/pagination.service';
import {
  BookSessionDto,
  QuerySessionsDto,
  RescheduleSessionDto,
} from './dto/session.dto';
import { Session } from './entities/session.entity';
import {
  ACTIVE_STATUSES,
  CANCELLATION_NOTICE_HOURS,
  MAX_RATING,
  MIN_RATING,
  SessionRole,
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
    @Optional()
    private readonly pagination: PaginationService = new PaginationService(),
  ) {}

  async book(
    menteeId: string,
    dto: BookSessionDto,
    now: Date = new Date(),
  ): Promise<Session> {
    if (this.sameWallet(dto.mentorId, menteeId)) {
      throw new BusinessRuleException(
        'You cannot book a session with yourself',
      );
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    this.assertWindow(startTime, endTime, now);
    await this.assertMentorAvailable(dto.mentorId, startTime);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const mentorSessions = await this.lockActiveSessions(
          manager,
          'mentorId',
          dto.mentorId,
          startTime,
          endTime,
        );
        if (findConflict(mentorSessions, { startTime, endTime })) {
          throw new DuplicateResourceException(
            'The mentor already has a session at that time',
          );
        }

        const menteeSessions = await this.lockActiveSessions(
          manager,
          'menteeId',
          menteeId,
          startTime,
          endTime,
        );
        if (findConflict(menteeSessions, { startTime, endTime })) {
          throw new DuplicateResourceException(
            'You already have a session at that time',
          );
        }

        return manager.save(
          manager.create(Session, {
            mentorId: dto.mentorId,
            menteeId,
            startTime,
            endTime,
            status: SessionStatus.PENDING,
            meetingUrl: null,
            notes: dto.notes ?? null,
            rating: null,
            review: null,
            cancellationReason: null,
            reminderSentAt: null,
          }),
        );
      });
    } catch (err) {
      if ((err as { code?: string }).code === PG_EXCLUSION_VIOLATION) {
        throw new DuplicateResourceException(
          'The mentor already has a session at that time',
        );
      }
      throw err;
    }
  }

  async reschedule(
    id: string,
    userId: string,
    dto: RescheduleSessionDto,
    isAdmin = false,
    now: Date = new Date(),
  ): Promise<Session> {
    const session = await this.findOne(id);
    this.assertParty(session, userId, isAdmin);
    if (!ACTIVE_STATUSES.includes(session.status)) {
      throw new BusinessRuleException(
        `Cannot reschedule a ${session.status} session`,
      );
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    this.assertWindow(startTime, endTime, now);
    await this.assertMentorAvailable(session.mentorId, startTime);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const mentorSessions = await this.lockActiveSessions(
          manager,
          'mentorId',
          session.mentorId,
          startTime,
          endTime,
          session.id,
        );
        if (findConflict(mentorSessions, { startTime, endTime })) {
          throw new DuplicateResourceException(
            'The mentor already has a session at that time',
          );
        }

        const menteeSessions = await this.lockActiveSessions(
          manager,
          'menteeId',
          session.menteeId,
          startTime,
          endTime,
          session.id,
        );
        if (findConflict(menteeSessions, { startTime, endTime })) {
          throw new DuplicateResourceException(
            'You already have a session at that time',
          );
        }

        session.startTime = startTime;
        session.endTime = endTime;
        session.reminderSentAt = null;
        return manager.save(session);
      });
    } catch (err) {
      if ((err as { code?: string }).code === PG_EXCLUSION_VIOLATION) {
        throw new DuplicateResourceException(
          'The mentor already has a session at that time',
        );
      }
      throw err;
    }
  }

  async findOne(id: string): Promise<Session> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) throw new ResourceNotFoundException('Session', id);
    return session;
  }

  async confirm(id: string, mentorId: string): Promise<Session> {
    const session = await this.findOne(id);
    if (!this.sameWallet(session.mentorId, mentorId)) {
      throw new ForbiddenException('Only the mentor can confirm a session');
    }
    return this.transition(session, SessionStatus.CONFIRMED);
  }

  async complete(id: string, mentorId: string): Promise<Session> {
    const session = await this.findOne(id);
    if (!this.sameWallet(session.mentorId, mentorId)) {
      throw new ForbiddenException('Only the mentor can complete a session');
    }
    return this.transition(session, SessionStatus.COMPLETED);
  }

  async markNoShow(id: string, mentorId: string): Promise<Session> {
    const session = await this.findOne(id);
    if (!this.sameWallet(session.mentorId, mentorId)) {
      throw new ForbiddenException('Only the mentor can mark a no-show');
    }
    return this.transition(session, SessionStatus.NO_SHOW);
  }

  async cancel(
    id: string,
    userId: string,
    reason?: string,
    isAdmin = false,
    now: Date = new Date(),
  ): Promise<Session> {
    const session = await this.findOne(id);
    this.assertParty(session, userId, isAdmin);

    if (
      !isAdmin &&
      session.status === SessionStatus.CONFIRMED &&
      !hasCancellationNotice(session.startTime, now)
    ) {
      throw new BusinessRuleException(
        `Confirmed sessions need at least ${CANCELLATION_NOTICE_HOURS} hours notice to cancel`,
      );
    }

    session.cancellationReason = reason ?? null;
    return this.transition(session, SessionStatus.CANCELLED);
  }

  async history(
    userId: string,
    query: QuerySessionsDto,
  ): Promise<PaginatedResponse<Session>> {
    const sortColumns: Record<
      NonNullable<QuerySessionsDto['sortBy']>,
      string
    > = {
      startTime: 's.startTime',
      createdAt: 's.createdAt',
      status: 's.status',
      rating: 's.rating',
    };

    const qb = this.sessions.createQueryBuilder('s');
    if (query.role === SessionRole.MENTOR) {
      qb.where('s.mentorId = :userId', { userId });
    } else if (query.role === SessionRole.MENTEE) {
      qb.where('s.menteeId = :userId', { userId });
    } else {
      qb.where(
        new Brackets((where) =>
          where.where('s.mentorId = :userId').orWhere('s.menteeId = :userId'),
        ),
        { userId },
      );
    }

    if (query.status)
      qb.andWhere('s.status = :status', { status: query.status });
    if (query.from)
      qb.andWhere('s.startTime >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('s.startTime < :to', { to: new Date(query.to) });

    qb.orderBy(
      sortColumns[query.sortBy ?? 'startTime'],
      query.order ?? 'DESC',
    ).addOrderBy('s.id', 'DESC');
    return this.pagination.paginate(qb, query.page, query.limit);
  }

  async rate(
    id: string,
    menteeId: string,
    rating: number,
    review?: string,
  ): Promise<Session> {
    if (
      !Number.isInteger(rating) ||
      rating < MIN_RATING ||
      rating > MAX_RATING
    ) {
      throw new BusinessRuleException(
        `Rating must be between ${MIN_RATING} and ${MAX_RATING}`,
      );
    }

    const session = await this.findOne(id);
    if (!this.sameWallet(session.menteeId, menteeId)) {
      throw new ForbiddenException('Only the mentee can rate a session');
    }
    if (session.status !== SessionStatus.COMPLETED) {
      throw new BusinessRuleException('Only completed sessions can be rated');
    }
    if (session.rating != null) {
      throw new DuplicateResourceException('This session was already rated');
    }

    session.rating = rating;
    session.review = review ?? null;
    return this.sessions.save(session);
  }

  async sendReminder(session: Session, now: Date = new Date()): Promise<void> {
    this.logger.log(`Reminder placeholder for session ${session.id}`);
    session.reminderSentAt = now;
    await this.sessions.save(session);
  }

  async sendDueReminders(now: Date = new Date()): Promise<number> {
    const horizon = new Date(
      now.getTime() + CANCELLATION_NOTICE_HOURS * 3_600_000,
    );
    const due = await this.sessions
      .createQueryBuilder('s')
      .where('s.status = :status', { status: SessionStatus.CONFIRMED })
      .andWhere('s.reminderSentAt IS NULL')
      .andWhere('s.startTime > :now AND s.startTime <= :horizon', {
        now,
        horizon,
      })
      .getMany();

    for (const session of due) {
      await this.sendReminder(session, now);
    }
    return due.length;
  }

  private async transition(
    session: Session,
    to: SessionStatus,
  ): Promise<Session> {
    if (!canTransition(session.status, to)) {
      throw new BusinessRuleException(
        `Cannot move a ${session.status} session to ${to}`,
      );
    }
    session.status = to;
    return this.sessions.save(session);
  }

  private assertWindow(start: Date, end: Date, now: Date): void {
    const invalid = validateSessionWindow(start, end, now);
    if (invalid) throw new BusinessRuleException(invalid);
  }

  private async assertMentorAvailable(
    mentorId: string,
    start: Date,
  ): Promise<void> {
    const result = await this.availability.isAvailable(mentorId, start);
    if (!result.available) {
      throw new DuplicateResourceException(
        'The mentor is not available at that time',
      );
    }
  }

  private assertParty(
    session: Session,
    userId: string,
    isAdmin: boolean,
  ): void {
    if (isAdmin) return;
    if (
      this.sameWallet(session.mentorId, userId) ||
      this.sameWallet(session.menteeId, userId)
    ) {
      return;
    }
    throw new ForbiddenException('You are not part of this session');
  }

  private sameWallet(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  private lockActiveSessions(
    manager: EntityManager,
    column: 'mentorId' | 'menteeId',
    userId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<Session[]> {
    const qb = manager
      .createQueryBuilder(Session, 's')
      .setLock('pessimistic_write')
      .where(`s.${column} = :userId`, { userId })
      .andWhere('s.status IN (:...active)', { active: ACTIVE_STATUSES })
      .andWhere('s.startTime < :end AND s.endTime > :start', { start, end });
    if (excludeId) qb.andWhere('s.id != :sessionId', { sessionId: excludeId });
    return qb.getMany();
  }
}
