import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionStatus } from './enums/session-status.enum';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {}

  // Create a new session
  async create(createSessionDto: CreateSessionDto): Promise<Session> {
    const newSession = this.sessionRepository.create({
      ...createSessionDto,
      status: SessionStatus.PENDING, // Default status
    });

    return await this.sessionRepository.save(newSession);
  }

  // Get all sessions (excluding soft-deleted ones)
  async findAll(): Promise<Session[]> {
    return await this.sessionRepository.find({
      where: { deletedAt: null }, // Exclude soft-deleted sessions
    });
  }

  // Get a single session by ID
  async findOne(id: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id, deletedAt: null }, // Ensure session is not soft-deleted
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    return session;
  }

  // Update session details
  async update(id: string, updateSessionDto: UpdateSessionDto): Promise<Session> {
    const session = await this.findOne(id);

    Object.assign(session, updateSessionDto); // Merge updated fields

    return await this.sessionRepository.save(session);
  }

  // Update session status
  async updateStatus(id: string, status: SessionStatus): Promise<Session> {
    const session = await this.findOne(id);

    session.status = status; // Change status

    return await this.sessionRepository.save(session);
  }

  // Soft delete a session
  async softDelete(id: string): Promise<void> {
    const session = await this.findOne(id);

    await this.sessionRepository.softRemove(session); // Marks as deleted
  }

  // Restore a soft-deleted session
  async restore(id: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
    });

    if (!session || !session.deletedAt) {
      throw new NotFoundException(`Session with ID ${id} is not deleted or does not exist`);
    }

    session.deletedAt = null; // Remove the deleted flag

    return await this.sessionRepository.save(session);
  }
}
