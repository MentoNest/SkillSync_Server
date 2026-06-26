import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { RateSessionDto } from './dto/rate-session.dto';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async bookSession(dto: CreateSessionDto, requesterId: string): Promise<Session> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Session);
      const conflict = await repo
        .createQueryBuilder('s')
        .where('s.mentorId = :mentorId', { mentorId: dto.mentorId })
        .andWhere("s.status IN ('pending','confirmed')")
        .andWhere('s.startTime < :endTime AND s.endTime > :startTime', {
          startTime: dto.startTime,
          endTime: dto.endTime,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (conflict) {
        throw new ConflictException('Mentor is unavailable at this time');
      }

      const session = repo.create({
        mentorId: dto.mentorId,
        menteeId: dto.menteeId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        notes: dto.notes ?? null,
        meetingUrl: dto.meetingUrl ?? null,
        status: 'pending',
      });

      return repo.save(session);
    });
  }

  async confirmSession(id: string, userId: string): Promise<Session> {
    const session = await this.findSessionOrFail(id);

    if (session.mentorId !== userId) {
      throw new ForbiddenException('Only the mentor can confirm a session');
    }

    if (session.status !== 'pending') {
      throw new BadRequestException('Only pending sessions can be confirmed');
    }

    session.status = 'confirmed';
    return this.sessionRepo.save(session);
  }

  async cancelSession(id: string, userId: string): Promise<Session> {
    const session = await this.findSessionOrFail(id);

    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('You are not a participant of this session');
    }

    if (session.status === 'cancelled') {
      throw new BadRequestException('Session is already cancelled');
    }

    if (session.status === 'confirmed') {
      const hoursUntilSession =
        (session.startTime.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilSession < 24) {
        throw new BadRequestException('Cannot cancel within 24 hours of session');
      }
    }

    session.status = 'cancelled';
    return this.sessionRepo.save(session);
  }

  async rescheduleSession(
    id: string,
    userId: string,
    dto: RescheduleSessionDto,
  ): Promise<Session> {
    const session = await this.findSessionOrFail(id);

    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('You are not a participant of this session');
    }

    if (['cancelled', 'completed', 'no_show'].includes(session.status)) {
      throw new BadRequestException(
        `Cannot reschedule a session with status '${session.status}'`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Session);
      const conflict = await repo
        .createQueryBuilder('s')
        .where('s.mentorId = :mentorId', { mentorId: session.mentorId })
        .andWhere('s.id != :id', { id })
        .andWhere("s.status IN ('pending','confirmed')")
        .andWhere('s.startTime < :endTime AND s.endTime > :startTime', {
          startTime: dto.startTime,
          endTime: dto.endTime,
        })
        .setLock('pessimistic_write')
        .getOne();

      if (conflict) {
        throw new ConflictException('Mentor is unavailable at the requested time');
      }

      session.startTime = new Date(dto.startTime);
      session.endTime = new Date(dto.endTime);
      session.status = 'pending';

      return repo.save(session);
    });
  }

  async rateSession(
    id: string,
    userId: string,
    dto: RateSessionDto,
  ): Promise<Session> {
    const session = await this.findSessionOrFail(id);

    if (session.menteeId !== userId) {
      throw new ForbiddenException('Only the mentee can rate a session');
    }

    if (session.status !== 'completed') {
      throw new BadRequestException('Only completed sessions can be rated');
    }

    session.rating = dto.rating;
    return this.sessionRepo.save(session);
  }

  async getHistory(userId: string, status?: string): Promise<Session[]> {
    const qb = this.sessionRepo
      .createQueryBuilder('s')
      .where('s.mentorId = :userId OR s.menteeId = :userId', { userId })
      .orderBy('s.startTime', 'DESC');

    if (status) {
      qb.andWhere('s.status = :status', { status });
    }

    return qb.getMany();
  }

  async getSession(id: string, userId: string): Promise<Session> {
    const session = await this.findSessionOrFail(id);

    if (session.mentorId !== userId && session.menteeId !== userId) {
      throw new ForbiddenException('You are not a participant of this session');
    }

    return session;
  }

  private async findSessionOrFail(id: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session '${id}' not found`);
    }
    return session;
  }
}
