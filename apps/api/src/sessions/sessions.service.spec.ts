import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { Session, SessionStatus } from './entities/session.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionRepository: Repository<Session>;
  let bookingRepository: Repository<Booking>;

  const mockSession = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    bookingId: '550e8400-e29b-41d4-a716-446655440001',
    mentorProfileId: '550e8400-e29b-41d4-a716-446655440002',
    menteeUserId: '550e8400-e29b-41d4-a716-446655440003',
    startTime: new Date('2026-01-22T10:00:00Z'),
    endTime: new Date('2026-01-22T11:00:00Z'),
    status: SessionStatus.SCHEDULED,
    notes: null,
    metadata: null,
    createdAt: new Date('2026-01-22T08:00:00Z'),
    updatedAt: new Date('2026-01-22T08:00:00Z'),
    booking: undefined,
    mentorProfile: undefined,
    menteeUser: undefined,
  } as unknown as Session;

  const mockBooking = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    listingId: '550e8400-e29b-41d4-a716-446655440010',
    mentorProfileId: '550e8400-e29b-41d4-a716-446655440002',
    menteeUserId: '550e8400-e29b-41d4-a716-446655440003',
    startTime: new Date('2026-01-22T10:00:00Z'),
    endTime: new Date('2026-01-22T11:00:00Z'),
    status: BookingStatus.ACCEPTED,
    notes: null,
    createdAt: new Date('2026-01-22T07:00:00Z'),
    updatedAt: new Date('2026-01-22T08:00:00Z'),
    mentorProfile: { id: '550e8400-e29b-41d4-a716-446655440002' },
    menteeUser: { id: '550e8400-e29b-41d4-a716-446655440003' },
    listing: undefined,
    session: undefined,
  } as unknown as Booking;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        {
          provide: getRepositoryToken(Session),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    sessionRepository = module.get<Repository<Session>>(
      getRepositoryToken(Session),
    );
    bookingRepository = module.get<Repository<Booking>>(
      getRepositoryToken(Booking),
    );
  });

  describe('createFromBooking', () => {
    it('should create a session from an accepted booking', async () => {
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(mockBooking);
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(sessionRepository, 'create').mockReturnValue(mockSession);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(mockSession);

      const result = await service.createFromBooking(mockBooking.id);

      expect(result).toEqual({
        id: mockSession.id,
        bookingId: mockSession.bookingId,
        mentorProfileId: mockSession.mentorProfileId,
        menteeUserId: mockSession.menteeUserId,
        startTime: mockSession.startTime,
        endTime: mockSession.endTime,
        status: SessionStatus.SCHEDULED,
        notes: null,
        metadata: null,
        createdAt: mockSession.createdAt,
        updatedAt: mockSession.updatedAt,
      });

      expect(sessionRepository.create).toHaveBeenCalledWith({
        bookingId: mockBooking.id,
        mentorProfileId: mockBooking.mentorProfileId,
        menteeUserId: mockBooking.menteeUserId,
        startTime: mockBooking.startTime,
        endTime: mockBooking.endTime,
        status: SessionStatus.SCHEDULED,
      });
    });

    it('should not create session for non-accepted booking', async () => {
      const draftBooking = { ...mockBooking, status: BookingStatus.DRAFT };
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(draftBooking);

      await expect(service.createFromBooking(draftBooking.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should prevent duplicate session creation', async () => {
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(mockBooking);
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession);

      await expect(service.createFromBooking(mockBooking.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for non-existent booking', async () => {
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(null);

      await expect(service.createFromBooking('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('startSession', () => {
    it('should allow mentee to start a scheduled session', async () => {
      const startedSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession);
      jest
        .spyOn(sessionRepository, 'save')
        .mockResolvedValue(startedSession as Session);

      const result = await service.startSession(
        mockSession.id,
        mockSession.menteeUserId,
      );

      expect(result.status).toBe(SessionStatus.IN_PROGRESS);
      expect(sessionRepository.save).toHaveBeenCalled();
    });

    it('should allow mentor to start a scheduled session', async () => {
      const startedSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession);
      jest
        .spyOn(sessionRepository, 'save')
        .mockResolvedValue(startedSession as Session);

      const result = await service.startSession(
        mockSession.id,
        '',
        mockSession.mentorProfileId,
      );

      expect(result.status).toBe(SessionStatus.IN_PROGRESS);
    });

    it('should prevent unauthorized user from starting session', async () => {
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession);

      await expect(
        service.startSession(mockSession.id, 'unauthorized-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent starting non-scheduled session', async () => {
      const inProgressSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(inProgressSession as Session);

      await expect(
        service.startSession(mockSession.id, mockSession.menteeUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeSession', () => {
    it('should allow mentor to complete an in_progress session', async () => {
      const inProgressSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };
      const completedSession = {
        ...inProgressSession,
        status: SessionStatus.COMPLETED,
      };

      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(inProgressSession as Session);
      jest
        .spyOn(sessionRepository, 'save')
        .mockResolvedValue(completedSession as Session);

      const result = await service.completeSession(
        mockSession.id,
        mockSession.mentorProfileId,
      );

      expect(result.status).toBe(SessionStatus.COMPLETED);
    });

    it('should prevent mentee from completing session', async () => {
      const inProgressSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(inProgressSession as Session);

      await expect(
        service.completeSession(mockSession.id, 'unauthorized-mentor-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent completing non-in_progress session', async () => {
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession);

      await expect(
        service.completeSession(mockSession.id, mockSession.mentorProfileId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should find session for authorized mentee', async () => {
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession);

      const result = await service.findOne(
        mockSession.id,
        mockSession.menteeUserId,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(mockSession.id);
    });

    it('should find session for authorized mentor', async () => {
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession);

      const result = await service.findOne(
        mockSession.id,
        undefined,
        mockSession.mentorProfileId,
      );

      expect(result).toBeDefined();
    });

    it('should deny access to unauthorized user', async () => {
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession);

      await expect(
        service.findOne(mockSession.id, 'unauthorized-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne(mockSession.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Lifecycle validation', () => {
    it('should enforce state transitions: scheduled -> in_progress -> completed', async () => {
      // Test scheduled → in_progress
      const scheduledSession = { ...mockSession };
      const inProgressSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };
      const completedSession = {
        ...mockSession,
        status: SessionStatus.COMPLETED,
      };

      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValueOnce(scheduledSession as Session);
      jest
        .spyOn(sessionRepository, 'save')
        .mockResolvedValueOnce(inProgressSession as Session);

      const step1 = await service.startSession(
        mockSession.id,
        mockSession.menteeUserId,
      );
      expect(step1.status).toBe(SessionStatus.IN_PROGRESS);

      // Test in_progress → completed
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValueOnce(inProgressSession as Session);
      jest
        .spyOn(sessionRepository, 'save')
        .mockResolvedValueOnce(completedSession as Session);

      const step2 = await service.completeSession(
        mockSession.id,
        mockSession.mentorProfileId,
      );
      expect(step2.status).toBe(SessionStatus.COMPLETED);
    });

    it('should prevent state reversal', async () => {
      const completedSession = {
        ...mockSession,
        status: SessionStatus.COMPLETED,
      };

      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(completedSession as Session);

      // Cannot start a completed session
      await expect(
        service.startSession(mockSession.id, mockSession.menteeUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Timestamp validation', () => {
    it('should copy timestamps exactly from booking', async () => {
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(mockBooking);
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(sessionRepository, 'create').mockReturnValue(mockSession);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(mockSession);

      await service.createFromBooking(mockBooking.id);

      const createCall = jest.spyOn(sessionRepository, 'create').mock
        .calls[0][0];
      expect(createCall.startTime).toEqual(mockBooking.startTime);
      expect(createCall.endTime).toEqual(mockBooking.endTime);
    });
  });
});
