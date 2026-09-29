import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { SessionService } from './session.service.js';
import { NotificationService } from '../services/notification.service.js';
import { Session, SessionStatus } from './session.entity.js';
import { User } from '../user/entities/user.entity.js';
import { AvailabilitySlot } from '../entities/availability-slot.entity.js';

describe('SessionService', () => {
  let service: SessionService;
  let mockSessionRepo: any;
  let mockUserRepo: any;
  let mockAvailabilityRepo: any;
  let mockNotifier: any;

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

  // In-memory transaction stub: runs the work with a manager whose
  // repository proxies to the same mocks, so locked-booking tests exercise
  // the same overlap logic as the real flow.
  const manager = {
    getRepository: (_target: any) => mockSessionRepo,
    query: jest.fn().mockResolvedValue([]),
  };
  const mockDataSource = {
    transaction: jest.fn(async (work: (m: typeof manager) => Promise<unknown>) => work(manager)),
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

    mockAvailabilityRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockNotifier = {
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: getRepositoryToken(Session), useValue: mockSessionRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(AvailabilitySlot), useValue: mockAvailabilityRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: NotificationService, useValue: mockNotifier },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    mockDataSource.transaction.mockClear();
    (manager.query as jest.Mock).mockClear();
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

  it('locks both participant rows during booking', async () => {
    await service.bookSession('mentee-1', {
      mentorId: 'mentor-1',
      startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
    });

    // Two FOR UPDATE lock acquisitions, in deterministic (sorted) order.
    expect(manager.query).toHaveBeenCalledTimes(2);
    const lockOrder = (manager.query as jest.Mock).mock.calls.map((c) => c[1][0]);
    expect(lockOrder).toEqual([...lockOrder].sort());
  });

  it('rejects overlapping bookings inside the locked transaction', async () => {
    mockSessionRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
    });

    await expect(
      service.bookSession('mentee-1', {
        mentorId: 'mentor-1',
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toThrow(ConflictException);
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

  it('records the canceller and reason on cancellation', async () => {
    const futureSession = {
      ...mockSession,
      startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: SessionStatus.CONFIRMED,
    };
    mockSessionRepo.findOne.mockResolvedValue(futureSession);
    mockSessionRepo.save.mockImplementation(async (session) => session);

    const result = await service.cancelSession('session-1', 'mentee-1', 'schedule conflict');
    expect(result.status).toBe(SessionStatus.CANCELLED);
    expect(result.cancelledBy).toBe('mentee-1');
    expect(result.cancellationReason).toBe('schedule conflict');
  });

  it('confirms a pending session as the mentor', async () => {
    mockSessionRepo.findOne.mockResolvedValue({ ...mockSession, status: SessionStatus.PENDING });
    mockSessionRepo.save.mockImplementation(async (s) => s);

    const result = await service.confirmSession('session-1', 'mentor-1');
    expect(result.status).toBe(SessionStatus.CONFIRMED);
    expect(result.confirmedAt).toBeDefined();
  });

  it('refuses confirmation by the mentee', async () => {
    mockSessionRepo.findOne.mockResolvedValue({ ...mockSession, status: SessionStatus.PENDING });

    await expect(service.confirmSession('session-1', 'mentee-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses completing a session before its end time', async () => {
    mockSessionRepo.findOne.mockResolvedValue({
      ...mockSession,
      status: SessionStatus.CONFIRMED,
      endTime: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(service.completeSession('session-1', 'mentor-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('completes a confirmed session after its end time', async () => {
    mockSessionRepo.findOne.mockResolvedValue({
      ...mockSession,
      status: SessionStatus.CONFIRMED,
      endTime: new Date(Date.now() - 60 * 60 * 1000),
    });
    mockSessionRepo.save.mockImplementation(async (s) => s);

    const result = await service.completeSession('session-1', 'mentor-1');
    expect(result.status).toBe(SessionStatus.COMPLETED);
    expect(result.completedAt).toBeDefined();
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

  it('returns session history across both roles', async () => {
    await service.getSessionHistory('mentee-1');
    expect(mockSessionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [{ mentorId: 'mentee-1' }, { menteeId: 'mentee-1' }],
      }),
    );
  });
});
