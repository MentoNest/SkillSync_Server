import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionsService } from '../sessions.service';
import { Session, SessionStatus } from '../entities/session.entity';
import { User } from '../../auth/entities/user.entity';
import { AvailabilitySlot, AvailabilityException } from '../../availability/entities/availability.entity';
import { CreateSessionDto } from '../dto/session.dto';

describe('SessionsService - Booking Conflict Detection', () => {
  let service: SessionsService;
  let sessionRepository: Repository<Session>;
  let userRepository: Repository<User>;
  let availabilitySlotRepository: Repository<AvailabilitySlot>;
  let availabilityExceptionRepository: Repository<AvailabilityException>;
  let dataSource: DataSource;

  const mockMentorId = 'mentor-uuid-123';
  const mockMenteeId = 'mentee-uuid-456';

  const mockMentor = {
    id: mockMentorId,
    walletAddress: 'mentor-wallet',
    email: 'mentor@example.com',
    displayName: 'Test Mentor',
  };

  const mockMentee = {
    id: mockMenteeId,
    walletAddress: 'mentee-wallet',
    email: 'mentee@example.com',
    displayName: 'Test Mentee',
  };

  const mockDataSource = {
    transaction: jest.fn(async (cb) => {
      const mockTransactionalEntityManager = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };
      return cb(mockTransactionalEntityManager);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        {
          provide: getRepositoryToken(Session),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AvailabilitySlot),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AvailabilityException),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    sessionRepository = module.get<Repository<Session>>(getRepositoryToken(Session));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    availabilitySlotRepository = module.get<Repository<AvailabilitySlot>>(
      getRepositoryToken(AvailabilitySlot),
    );
    availabilityExceptionRepository = module.get<Repository<AvailabilityException>>(
      getRepositoryToken(AvailabilityException),
    );
    dataSource = module.get<DataSource>(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkBookingConflict', () => {
    it('should return false when no existing sessions exist', async () => {
      jest.spyOn(sessionRepository, 'find').mockResolvedValue([]);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(false);
    });

    it('should return false when existing sessions do not overlap', async () => {
      const nonOverlappingSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T08:00:00Z'),
          endTime: new Date('2026-04-30T09:00:00Z'),
          status: SessionStatus.CONFIRMED,
        } as Session,
        {
          id: 'session-2',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T12:00:00Z'),
          endTime: new Date('2026-04-30T13:00:00Z'),
          status: SessionStatus.CONFIRMED,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(nonOverlappingSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(false);
    });

    it('should return true when existing session overlaps with start time', async () => {
      const overlappingSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T09:00:00Z'),
          endTime: new Date('2026-04-30T10:30:00Z'),
          status: SessionStatus.CONFIRMED,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(overlappingSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(true);
    });

    it('should return true when existing session overlaps with end time', async () => {
      const overlappingSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T10:30:00Z'),
          endTime: new Date('2026-04-30T11:30:00Z'),
          status: SessionStatus.CONFIRMED,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(overlappingSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(true);
    });

    it('should return true when existing session is completely within requested time', async () => {
      const overlappingSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T10:15:00Z'),
          endTime: new Date('2026-04-30T10:45:00Z'),
          status: SessionStatus.PENDING,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(overlappingSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(true);
    });

    it('should return true when requested time is completely within existing session', async () => {
      const overlappingSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T09:00:00Z'),
          endTime: new Date('2026-04-30T12:00:00Z'),
          status: SessionStatus.CONFIRMED,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(overlappingSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(true);
    });

    it('should detect conflicts with pending sessions', async () => {
      const pendingSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T10:00:00Z'),
          endTime: new Date('2026-04-30T11:00:00Z'),
          status: SessionStatus.PENDING,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(pendingSessions);

      const startTime = new Date('2026-04-30T10:30:00Z');
      const endTime = new Date('2026-04-30T11:30:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(true);
    });

    it('should not detect conflicts with cancelled sessions', async () => {
      const cancelledSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T10:00:00Z'),
          endTime: new Date('2026-04-30T11:00:00Z'),
          status: SessionStatus.CANCELLED,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(cancelledSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(false);
    });

    it('should not detect conflicts with no_show sessions', async () => {
      const noShowSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T10:00:00Z'),
          endTime: new Date('2026-04-30T11:00:00Z'),
          status: SessionStatus.NO_SHOW,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(noShowSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(false);
    });

    it('should detect conflicts with exact same time slot', async () => {
      const exactMatchSessions = [
        {
          id: 'session-1',
          mentorId: mockMentorId,
          startTime: new Date('2026-04-30T10:00:00Z'),
          endTime: new Date('2026-04-30T11:00:00Z'),
          status: SessionStatus.CONFIRMED,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(exactMatchSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(true);
    });

    it('should not detect conflicts for different mentor', async () => {
      const otherMentorSessions = [
        {
          id: 'session-1',
          mentorId: 'other-mentor-id',
          startTime: new Date('2026-04-30T10:00:00Z'),
          endTime: new Date('2026-04-30T11:00:00Z'),
          status: SessionStatus.CONFIRMED,
        } as Session,
      ];

      jest.spyOn(sessionRepository, 'find').mockResolvedValue(otherMentorSessions);

      const startTime = new Date('2026-04-30T10:00:00Z');
      const endTime = new Date('2026-04-30T11:00:00Z');

      const hasConflict = await service.checkBookingConflict(
        mockMentorId,
        startTime,
        endTime,
      );

      expect(hasConflict).toBe(false);
    });
  });

  describe('bookSession - Integration with conflict detection', () => {
    it('should throw BadRequestException when booking conflicts with existing session', async () => {
      const mockTransactionalEntityManager = {
        findOne: jest.fn().mockImplementation(async (entity, options) => {
          if (entity === User) {
            return options.where.id === mockMentorId ? mockMentor : mockMentee;
          }
          return null;
        }),
        create: jest.fn().mockReturnValue({
          mentorId: mockMentorId,
          menteeId: mockMenteeId,
          startTime: new Date('2026-04-30T10:00:00Z'),
          endTime: new Date('2026-04-30T11:00:00Z'),
          status: SessionStatus.PENDING,
        }),
        save: jest.fn().mockResolvedValue({
          id: 'new-session-id',
          mentorId: mockMentorId,
          menteeId: mockMenteeId,
          startTime: new Date('2026-04-30T10:00:00Z'),
          endTime: new Date('2026-04-30T11:00:00Z'),
          status: SessionStatus.PENDING,
        }),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => {
        return cb(mockTransactionalEntityManager);
      });

      // Mock conflict detection to return true
      jest.spyOn(service, 'checkBookingConflict').mockResolvedValue(true);

      const createSessionDto: CreateSessionDto = {
        mentorId: mockMentorId,
        startTime: '2026-04-30T10:00:00Z',
        endTime: '2026-04-30T11:00:00Z',
      };

      await expect(service.bookSession(mockMenteeId, createSessionDto)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.bookSession(mockMenteeId, createSessionDto)).rejects.toThrow(
        'Time slot is already booked or conflicts with another session',
      );
    });

    it('should successfully book session when no conflicts exist', async () => {
      const mockTransactionalEntityManager = {
        findOne: jest.fn().mockImplementation(async (entity, options) => {
          if (entity === User) {
            return options.where.id === mockMentorId ? mockMentor : mockMentee;
          }
          return null;
        }),
        create: jest.fn().mockReturnValue({
          mentorId: mockMentorId,
          menteeId: mockMenteeId,
          startTime: new Date('2026-04-30T14:00:00Z'),
          endTime: new Date('2026-04-30T15:00:00Z'),
          status: SessionStatus.PENDING,
        }),
        save: jest.fn().mockResolvedValue({
          id: 'new-session-id',
          mentorId: mockMentorId,
          menteeId: mockMenteeId,
          startTime: new Date('2026-04-30T14:00:00Z'),
          endTime: new Date('2026-04-30T15:00:00Z'),
          status: SessionStatus.PENDING,
        }),
      };

      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => {
        return cb(mockTransactionalEntityManager);
      });

      // Mock no conflict
      jest.spyOn(service, 'checkBookingConflict').mockResolvedValue(false);

      // Mock availability check
      jest.spyOn(service as any, 'checkMentorAvailability').mockResolvedValue(true);

      const createSessionDto: CreateSessionDto = {
        mentorId: mockMentorId,
        startTime: '2026-04-30T14:00:00Z',
        endTime: '2026-04-30T15:00:00Z',
        notes: 'Test session',
      };

      const result = await service.bookSession(mockMenteeId, createSessionDto);

      expect(result).toBeDefined();
      expect(result.mentorId).toBe(mockMentorId);
      expect(result.menteeId).toBe(mockMenteeId);
      expect(result.status).toBe(SessionStatus.PENDING);
    });
  });
});
