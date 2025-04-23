import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Session } from '../session.entity';
import { CreateSessionDto } from '../dto/create-session.dto';
import { UpdateSessionDto } from '../dto/update-session.dto';
import { SessionStatus } from 'src/common/enums/SessionStatus.enum';



@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
  ) {}

  async createSession(createSessionDto: CreateSessionDto): Promise<Session> {
    const session = this.sessionsRepository.create({
      ...createSessionDto,
      status: SessionStatus.PENDING,
    });
    return await this.sessionsRepository.save(session);
  }

  async getAllSessions(includeDeleted = false): Promise<Session[]> {
    return await this.sessionsRepository.find({
      where: includeDeleted ? {} : { status: Not(SessionStatus.CANCELED) },
    });
  }

  async getSessionById(id: number): Promise<Session | null> {
    return await this.sessionsRepository.findOne({ where: { id } });
  }

  async updateSession(id: number, updateSessionDto: UpdateSessionDto): Promise<Session> {
    const session = await this.sessionsRepository.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');

    if (updateSessionDto.status) {
      if (!Object.values(SessionStatus).includes(updateSessionDto.status)) {
        throw new BadRequestException('Invalid session status');
      }
      session.status = updateSessionDto.status;
    }

    Object.assign(session, updateSessionDto);
    return await this.sessionsRepository.save(session);
  }

  async softDeleteSession(id: number): Promise<{ message: string }> {
    const session = await this.sessionsRepository.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');

    session.status = SessionStatus.CANCELED;
    await this.sessionsRepository.save(session);

    return { message: 'Session deleted (soft delete applied)' };
  }
}
