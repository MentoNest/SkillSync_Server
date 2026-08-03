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

  // New milestone session creation
  async createMilestoneSession(dto: any, buyerId: string): Promise<Session> {
    // Validate milestones sum to 100%
    const totalPercentage = dto.milestones.reduce((sum: number, m: any) => sum + m.percentage, 0);
    if (totalPercentage !== 100) {
      throw new BadRequestException('Milestone percentages must sum to 100%');
    }

    // Format milestones for storage
    const milestones = dto.milestones.map((m: any) => ({
      ...m,
      released: false,
    }));

    const session = this.sessionRepo.create({
      mentorId: dto.sellerId,
      menteeId: buyerId,
      blockchainSessionId: dto.sessionId,
      amount: dto.amount,
      tokenAddress: dto.tokenAddress || null,
      milestones,
      rating: {
        buyerRating: null,
        sellerRating: null,
        buyerComment: null,
        sellerComment: null,
      },
      startTime: new Date(),
      endTime: dto.deadline ? new Date(dto.deadline) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      status: SessionStatus.CREATED,
    });

    this.logger.log(`Created milestone session ${dto.sessionId} for buyer ${buyerId}`);
    return this.sessionRepo.save(session);
  }

  // Start milestone session
  async startMilestoneSession(sessionId: string, userId: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Verify caller is the seller (mentor)
    if (session.mentorId !== userId) {
      throw new BadRequestException('Only the seller can start the milestone session');
    }

    if (session.status !== SessionStatus.LOCKED) {
      throw new BadRequestException('Session must be locked to start milestones');
    }

    if (!session.milestones || session.milestones.length === 0) {
      throw new BadRequestException('No milestones defined for this session');
    }

    session.status = SessionStatus.MILESTONE_IN_PROGRESS;
    session.startedAt = new Date();
    
    this.logger.log(`Started milestone session ${sessionId}`);
    return this.sessionRepo.save(session);
  }

  // Complete a specific milestone
  async completeMilestone(sessionId: string, milestoneIndex: number, userId: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Verify caller is the seller (mentor)
    if (session.mentorId !== userId) {
      throw new BadRequestException('Only the seller can complete milestones');
    }

    if (session.status !== SessionStatus.MILESTONE_IN_PROGRESS) {
      throw new BadRequestException('Milestone session is not in progress');
    }

    if (!session.milestones || milestoneIndex >= session.milestones.length) {
      throw new BadRequestException('Milestone index is invalid');
    }

    const milestone = session.milestones[milestoneIndex];
    if (milestone.released) {
      throw new BadRequestException('Milestone has already been released');
    }

    // Mark milestone as completed
    session.milestones[milestoneIndex] = {
      ...milestone,
      released: true,
      completedAt: new Date(),
    };

    // Check if all milestones are completed
    const allCompleted = session.milestones.every(m => m.released);
    if (allCompleted) {
      session.status = SessionStatus.COMPLETED;
    }

    this.logger.log(`Completed milestone ${milestoneIndex} for session ${sessionId}`);
    return this.sessionRepo.save(session);
  }

  // Submit rating to blockchain
  async submitBlockchainRating(sessionId: string, dto: { rating: number; comment?: string }, userId: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Validate rating range
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Only allow ratings for approved or resolved sessions
    if (session.status !== SessionStatus.APPROVED && session.status !== SessionStatus.RESOLVED) {
      throw new BadRequestException('Only approved or resolved sessions can be rated');
    }

    // Update the appropriate rating field based on caller
    if (session.menteeId === userId) {
      if (session.rating?.buyerRating) {
        throw new BadRequestException('You have already submitted a rating');
      }
      session.rating = {
        ...session.rating,
        buyerRating: dto.rating,
        buyerComment: dto.comment || null,
      };
    } else if (session.mentorId === userId) {
      if (session.rating?.sellerRating) {
        throw new BadRequestException('You have already submitted a rating');
      }
      session.rating = {
        ...session.rating,
        sellerRating: dto.rating,
        sellerComment: dto.comment || null,
      };
    } else {
      throw new BadRequestException('You are not authorized to rate this session');
    }

    this.logger.log(`Submitted ${session.menteeId === userId ? 'buyer' : 'seller'} rating for session ${sessionId}`);
    return this.sessionRepo.save(session);
  }

  // Get all milestones for a session
  async getSessionMilestones(sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return {
      sessionId: session.id,
      blockchainSessionId: session.blockchainSessionId,
      status: session.status,
      milestones: session.milestones || [],
      allCompleted: session.milestones?.every(m => m.released) || false,
    };
  }

  // Get ratings for a session
  async getSessionRatings(sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return {
      sessionId: session.id,
      blockchainSessionId: session.blockchainSessionId,
      status: session.status,
      ratings: session.rating || {
        buyerRating: null,
        sellerRating: null,
        buyerComment: null,
        sellerComment: null,
      },
      averageRating: this.calculateAverageRating(session.rating),
    };
  }

  // Helper to calculate average rating
  private calculateAverageRating(rating: any): number | null {
    if (!rating) return null;
    const ratings = [];
    if (rating.buyerRating) ratings.push(rating.buyerRating);
    if (rating.sellerRating) ratings.push(rating.sellerRating);
    if (ratings.length === 0) return null;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
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