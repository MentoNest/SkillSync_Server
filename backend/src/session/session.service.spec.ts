import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionService } from './session.service';
import { Session, SessionStatus } from './session.entity';
import { User } from '../user/entities/user.entity';

describe('SessionService', () => {
  let service: SessionService;
  let mockSessionRepo: any;
  let mockUserRepo: any;

  const mockUser: Partial<User> = {
    id: 'user-1',
    displayName: 'Test User',
    email: 'test@example.com',
  };

  const mockSession: Partial<Session> = {
    id: 'session-1',
    mentorId: 'mentor-1',
    menteeId: 'mentee-1',
    startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
    endTime: new Date(Date.now() + 49 * 60 * 60 * 1000),
    status: SessionStatus.PENDING,
    meetingUrl: 'https://meet.google.com/test',
    notes: 'Test session',
  };

  beforeEach(async () => {
    mockSessionRepo = {
      create: jest.fn().mockReturnValue(mockSession),
      save: jest.fn().mockResolvedValue(mockSession),
      findOne: jest.fn().mockResolvedValue(mockSession),
      find: jest.fn().mockResolvedValue([mockSession]),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      }),
    };

    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: getRepositoryToken(Session), useValue: mockSessionRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  it('should book a session successfully', async () => {
    const result = await service.bookSession('mentee-1', {
      mentorId: 'mentor-1',
      startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
    });
    expect(result).toBeDefined();
    expect(mockSessionRepo.create).toHaveBeenCalled();
    expect(mockSessionRepo.save).toHaveBeenCalled();
  });

  it('should cancel session within allowed window', async () => {
    const futureSession = {
      ...mockSession,
      startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: SessionStatus.PENDING,
    };
    mockSessionRepo.findOne.mockResolvedValue(futureSession);
    mockSessionRepo.save.mockImplementation(async (session) => ({ ...session, status: SessionStatus.CANCELLED }));

    const result = await service.cancelSession('session-1', 'mentee-1');
    expect(result.status).toBe(SessionStatus.CANCELLED);
  });

  it('should reject cancellation within 24-hour window', async () => {
    const soonSession = {
      ...mockSession,
      startTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
      status: SessionStatus.CONFIRMED,
    };
    mockSessionRepo.findOne.mockResolvedValue(soonSession);

    await expect(
      service.cancelSession('session-1', 'mentee-1'),
    ).rejects.toThrow('at least');
  });

  it('should rate a completed session', async () => {
    const completedSession = {
      ...mockSession,
      status: SessionStatus.COMPLETED,
      rating: null,
      review: null,
    };
    mockSessionRepo.findOne.mockResolvedValue(completedSession);
    mockSessionRepo.save.mockImplementation(async (session) => ({ ...session, rating: 5, review: 'Great session!' }));

    const result = await service.rateSession('session-1', 'mentee-1', {
      rating: 5,
      review: 'Great session!',
    });
    expect(result.rating).toBe(5);
    expect(result.review).toBe('Great session!');
  });

  it('should get sessions for mentor', async () => {
    const result = await service.getSessionsByMentor('mentor-1');
    expect(result).toHaveLength(1);
    expect(mockSessionRepo.find).toHaveBeenCalled();
  });
});
