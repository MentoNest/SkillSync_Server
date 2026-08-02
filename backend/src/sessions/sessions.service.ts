import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Session } from './entities/session.entity.js';
import { SessionStatus } from './entities/enums/session-status.enum.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { UpdateSessionDto } from './dto/update-session.dto.js';
import { AvailabilityService } from '../availability/availability.service.js';

const CANCELLATION_POLICY_HOURS = 24;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async bookSession(
    dto: CreateSessionDto,
    menteeId: string,
  ): Promise<Session> {
    // Validate timing
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (end <= start) {
      throw new BadRequestException('endTime must be after startTime');
    }

    // Check mentor availability
    const isAvailable = await this.availabilityService.isAvailable(
      dto.mentorId,
      start,
    );
    if (!isAvailable) {
      throw new ConflictException('Mentor is not available at this time');
    }

    // Prevent double-booking
    const conflict = await this.sessionRepo.findOne({
      where: {
        mentorId: dto.mentorId,
        status: Not(SessionStatus.CANCELLED),
        startTime: Not(end),
      },
    });

    if (conflict) {
      const conflictStart = new Date(conflict.startTime);
      const conflictEnd = new Date(conflict.endTime);
      if (start < conflictEnd && end > conflictStart) {
        throw new ConflictException(
          'Mentor already has a session during this time',
        );
      }
    }

    const session = this.sessionRepo.create({
      mentorId: dto.mentorId,
      menteeId,
      startTime: start,
      endTime: end,
      meetingUrl: dto.meetingUrl || null,
      notes: dto.notes || null,
      status: SessionStatus.PENDING,
    });

    return this.sessionRepo.save(session);
  }

  async cancelSession(id: string, userId: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }

    if (session.menteeId !== userId && session.mentorId !== userId) {
      throw new BadRequestException('Not authorized to cancel this session');
    }

    if (session.status === SessionStatus.CANCELLED) {
      throw new BadRequestException('Session is already cancelled');
    }

    // Enforce 24-hour cancellation policy
    const hoursUntilStart =
      (new Date(session.startTime).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilStart < CANCELLATION_POLICY_HOURS) {
      throw new BadRequestException(
        `Cannot cancel within ${CANCELLATION_POLICY_HOURS} hours of session start`,
      );
    }

    session.status = SessionStatus.CANCELLED;
    return this.sessionRepo.save(session);
  }

  async rescheduleSession(
    id: string,
    dto: CreateSessionDto,
    userId: string,
  ): Promise<Session> {
    const oldSession = await this.cancelSession(id, userId);
    return this.bookSession(dto, oldSession.menteeId);
  }

  async completeSession(id: string, userId: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }
    if (session.mentorId !== userId) {
      throw new BadRequestException('Only the mentor can complete a session');
    }
    if (session.status !== SessionStatus.CONFIRMED) {
      throw new BadRequestException('Session must be confirmed to complete');
    }
    session.status = SessionStatus.COMPLETED;
    return this.sessionRepo.save(session);
  }

  async rateSession(
    id: string,
    dto: { rating: number; review?: string },
    userId: string,
  ): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }
    if (session.menteeId !== userId) {
      throw new BadRequestException('Only the mentee can rate a session');
    }
    if (session.status !== SessionStatus.COMPLETED) {
      throw new BadRequestException('Session must be completed to rate');
    }
    session.rating = dto.rating;
    session.review = dto.review || null;
    return this.sessionRepo.save(session);
  }

  async getMentorSessions(
    mentorId: string,
    query: { page?: number; limit?: number; status?: SessionStatus },
  ): Promise<{ data: Session[]; total: number }> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const where: any = { mentorId };
    if (query.status) {
      where.status = query.status;
    }
    const [data, total] = await this.sessionRepo.findAndCount({
      where,
      order: { startTime: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { data, total };
  }

  async getMenteeSessions(
    menteeId: string,
    query: { page?: number; limit?: number; status?: SessionStatus },
  ): Promise<{ data: Session[]; total: number }> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const where: any = { menteeId };
    if (query.status) {
      where.status = query.status;
    }
    const [data, total] = await this.sessionRepo.findAndCount({
      where,
      order: { startTime: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { data, total };
  }
}
