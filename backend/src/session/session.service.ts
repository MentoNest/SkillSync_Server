import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, Not } from 'typeorm';
import { Session, SessionStatus } from './session.entity';
import { User } from '../user/entities/user.entity';
import { BookSessionDto, RescheduleSessionDto, RateSessionDto } from './dto/session.dto';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly CANCELLATION_WINDOW_HOURS = 24;

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async bookSession(menteeId: string, dto: BookSessionDto): Promise<Session> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    if (startTime <= new Date()) {
      throw new BadRequestException('Session must be scheduled in the future');
    }

    const mentor = await this.userRepository.findOne({ where: { id: dto.mentorId } });
    if (!mentor) {
      throw new NotFoundException('Mentor not found');
    }

    const hasConflict = await this.checkDoubleBooking(dto.mentorId, startTime, endTime);
    if (hasConflict) {
      throw new ConflictException('Mentor is not available during this time slot');
    }

    const menteeConflict = await this.checkDoubleBooking(menteeId, startTime, endTime);
    if (menteeConflict) {
      throw new ConflictException('You already have a session during this time slot');
    }

    const session = this.sessionRepository.create({
      mentorId: dto.mentorId,
      menteeId,
      startTime,
      endTime,
      meetingUrl: dto.meetingUrl,
      notes: dto.notes,
      status: SessionStatus.PENDING,
    });

    return this.sessionRepository.save(session);
  }

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

    const hoursUntilStart =
      (new Date(session.startTime).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilStart < this.CANCELLATION_WINDOW_HOURS) {
      throw new BadRequestException(
        `Sessions must be cancelled at least ${this.CANCELLATION_WINDOW_HOURS} hours before the start time`,
      );
    }

    session.status = SessionStatus.CANCELLED;
    return this.sessionRepository.save(session);
  }

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

    const hasConflict = await this.checkDoubleBooking(
      session.mentorId,
      startTime,
      endTime,
      sessionId,
    );
    if (hasConflict) {
      throw new ConflictException('Mentor is not available during this time slot');
    }

    session.startTime = startTime;
    session.endTime = endTime;
    session.status = SessionStatus.PENDING;

    return this.sessionRepository.save(session);
  }

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

  private async checkDoubleBooking(
    userId: string,
    startTime: Date,
    endTime: Date,
    excludeSessionId?: string,
  ): Promise<boolean> {
    const query = this.sessionRepository
      .createQueryBuilder('session')
      .where(
        '(session.mentorId = :userId OR session.menteeId = :userId)',
        { userId },
      )
      .andWhere('session.status IN (:...statuses)', {
        statuses: [SessionStatus.PENDING, SessionStatus.CONFIRMED],
      })
      .andWhere(
        'session.startTime < :endTime AND session.endTime > :startTime',
        { startTime: endTime.toISOString(), endTime: startTime.toISOString() },
      );

    if (excludeSessionId) {
      query.andWhere('session.id != :excludeId', { excludeId: excludeSessionId });
    }

    const count = await query.getCount();
    return count > 0;
  }
}
