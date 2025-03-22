import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../session.entity';
import { CreateSessionDto } from '../dto/createSession.dto';
import { UpdateSessionDto } from '../dto/updateSession.dto';
import { RedisService } from 'src/common/redis/cache.service';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
  ) {}

  async create(createSessionDto: CreateSessionDto): Promise<Session> {
    const session = this.sessionRepository.create(createSessionDto);
    return await this.sessionRepository.save(session);
  }

  async findAll(): Promise<Session[]> {
    return await this.sessionRepository.find();
  }

  async findOne(id: number): Promise<Session> {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
    return session;
  }

  async update(id: number, updateSessionDto: UpdateSessionDto): Promise<Session> {
    const session = await this.sessionRepository.preload({
      id,
      ...updateSessionDto,
    });
    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
    return await this.sessionRepository.save(session);
  }

  async remove(id: number): Promise<void> {
    const result = await this.sessionRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
  constructor(private readonly redisService: RedisService) {}

  async create(createSessionDto: CreateSessionDto): Promise<Session> {
    const newSession: Session = { id: this.idCounter++, ...createSessionDto };
    this.sessions.push(newSession);

    // Cache the new session
    await this.redisService.set(`session:${newSession.id}`, newSession, 1800); // 30 minutes TTL

    // Invalidate the sessions list cache
    await this.redisService.delete('sessions:all');
    await this.redisService.delete('sessions:available');

    return newSession;
  }

  async findAll(): Promise<Session[]> {
    // Try to get from cache first
    const cachedSessions =
      await this.redisService.get<Session[]>('sessions:all');
    if (cachedSessions) {
      return cachedSessions;
    }

    // If not in cache, store in cache (15 minutes TTL)
    await this.redisService.set('sessions:all', this.sessions, 900);

    return this.sessions;
  }

  async findAvailableSessions(): Promise<Session[]> {
    // Try to get available sessions from cache
    const cachedAvailableSessions =
      await this.redisService.get<Session[]>('sessions:available');
    if (cachedAvailableSessions) {
      return cachedAvailableSessions;
    }

    // If not in cache, filter available sessions
    const availableSessions = this.sessions.filter(
      (session) => session.status === 'available',
    );

    // Cache available sessions (5 minutes TTL - this data changes frequently)
    await this.redisService.set('sessions:available', availableSessions, 300);

    return availableSessions;
  }

  async findOne(id: number): Promise<Session> {
    // Try to get from cache first
    const cachedSession = await this.redisService.get<Session>(`session:${id}`);
    if (cachedSession) {
      return cachedSession;
    }

    // If not in cache, get from in-memory storage
    const session = this.sessions.find((session) => session.id === id);

    // Cache the result if found (30 minutes TTL)
    if (session) {
      await this.redisService.set(`session:${id}`, session, 1800);
    }

    return session;
  }

  async update(
    id: number,
    updateSessionDto: UpdateSessionDto,
  ): Promise<Session> {
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index < 0) return null;

    this.sessions[index] = { ...this.sessions[index], ...updateSessionDto };

    // Update cache with new data
    await this.redisService.set(`session:${id}`, this.sessions[index], 1800);

    // Invalidate related caches
    await this.redisService.delete('sessions:all');
    await this.redisService.delete('sessions:available');

    return this.sessions[index];
  }

  async remove(id: number): Promise<boolean> {
    const initialLength = this.sessions.length;
    this.sessions = this.sessions.filter((session) => session.id !== id);

    // Delete from cache
    await this.redisService.delete(`session:${id}`);

    // Invalidate related caches
    await this.redisService.delete('sessions:all');
    await this.redisService.delete('sessions:available');

    return this.sessions.length < initialLength;
  }
}
