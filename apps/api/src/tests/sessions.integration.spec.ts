import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionsService } from '../sessions/sessions.service';
import { BookingsService } from '../bookings/bookings.service';
import { Session, SessionStatus } from '../sessions/entities/session.entity';
import { Booking, BookingStatus } from '../bookings/entities/booking.entity';

describe('Session Lifecycle Integration', () => {
  let sessionsService: SessionsService;
  let bookingsService: BookingsService;
  let sessionRepository: Repository<Session>;
  let bookingRepository: Repository<Booking>;

  const mockMentorProfileId = '550e8400-e29b-41d4-a716-446655440002';
  const mockMenteeUserId = '550e8400-e29b-41d4-a716-446655440003';
  const mockBookingId = '550e8400-e29b-41d4-a716-446655440001';
  const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';

  const mockBooking = {
    id: mockBookingId,
    listingId: '550e8400-e29b-41d4-a716-446655440010',
    mentorProfileId: mockMentorProfileId,
    menteeUserId: mockMenteeUserId,
    startTime: new Date('2026-01-22T10:00:00Z'),
    endTime: new Date('2026-01-22T11:00:00Z'),
    status: BookingStatus.DRAFT,
    notes: null,
    createdAt: new Date('2026-01-22T07:00:00Z'),
    updatedAt: new Date('2026-01-22T07:00:00Z'),
    mentorProfile: { id: mockMentorProfileId },
    menteeUser: { id: mockMenteeUserId },
  };

  const mockSession = {
    id: mockSessionId,
    bookingId: mockBookingId,
    mentorProfileId: mockMentorProfileId,
    menteeUserId: mockMenteeUserId,
    startTime: new Date('2026-01-22T10:00:00Z'),
    endTime: new Date('2026-01-22T11:00:00Z'),
    status: SessionStatus.SCHEDULED,
    notes: null,
    metadata: null,
    createdAt: new Date('2026-01-22T08:00:00Z'),
    updatedAt: new Date('2026-01-22T08:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        BookingsService,
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
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    sessionsService = module.get<SessionsService>(SessionsService);
    bookingsService = module.get<BookingsService>(BookingsService);
    sessionRepository = module.get<Repository<Session>>(
      getRepositoryToken(Session),
    );
    bookingRepository = module.get<Repository<Booking>>(
      getRepositoryToken(Booking),
    );
  });

  describe('Complete Session Lifecycle', () => {
    it('should follow the complete lifecycle: draft -> accept -> session created -> start -> complete', async () => {
      // Step 1: Booking is DRAFT
      expect(mockBooking.status).toBe(BookingStatus.DRAFT);

      // Step 2: Accept booking -> session auto-created
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(mockBooking);
      jest.spyOn(bookingRepository, 'save').mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
      });
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(sessionRepository, 'create').mockReturnValue(mockSession as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(mockSession as Session);

      await bookingsService.acceptBooking(mockBookingId);

      // Verify session was created
      expect(sessionRepository.create).toHaveBeenCalled();

      // Step 3: Session is SCHEDULED
      const sessionAfterCreation = {
        ...mockSession,
        status: SessionStatus.SCHEDULED,
      };

      // Step 4: Mentee starts session -> IN_PROGRESS
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(sessionAfterCreation as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue({
        ...sessionAfterCreation,
        status: SessionStatus.IN_PROGRESS,
      } as Session);

      const startResult = await sessionsService.startSession(
        mockSessionId,
        mockMenteeUserId,
      );
      expect(startResult.status).toBe(SessionStatus.IN_PROGRESS);

      // Step 5: Mentor completes session -> COMPLETED
      const sessionInProgress = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(sessionInProgress as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue({
        ...sessionInProgress,
        status: SessionStatus.COMPLETED,
      } as Session);

      const completeResult = await sessionsService.completeSession(
        mockSessionId,
        mockMentorProfileId,
      );
      expect(completeResult.status).toBe(SessionStatus.COMPLETED);
    });

    it('should ensure session is NOT created for declined bookings', async () => {
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(mockBooking);
      jest.spyOn(bookingRepository, 'save').mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.DECLINED,
      });

      await bookingsService.declineBooking(mockBookingId);

      // Verify session was NOT created
      expect(sessionRepository.create).not.toHaveBeenCalled();
    });

    it('should ensure session is NOT created for cancelled bookings', async () => {
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(mockBooking);
      jest.spyOn(bookingRepository, 'save').mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      });

      await bookingsService.cancelBooking(mockBookingId);

      // Verify session was NOT created
      expect(sessionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('Ownership and RBAC Enforcement', () => {
    it('should enforce mentee can start but not complete', async () => {
      const scheduledSession = { ...mockSession };
      const inProgressSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      // Mentee can start
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(scheduledSession as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(inProgressSession as Session);

      const startResult = await sessionsService.startSession(
        mockSessionId,
        mockMenteeUserId,
      );
      expect(startResult.status).toBe(SessionStatus.IN_PROGRESS);

      // Mentee cannot complete
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(inProgressSession as Session);

      const completeAttempt = sessionsService.completeSession(
        mockSessionId,
        'wrong-mentor-id',
      );

      await expect(completeAttempt).rejects.toThrow();
    });

    it('should enforce mentor can start and complete', async () => {
      const scheduledSession = { ...mockSession };
      const inProgressSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };
      const completedSession = {
        ...mockSession,
        status: SessionStatus.COMPLETED,
      };

      // Mentor can start
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(scheduledSession as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(inProgressSession as Session);

      const startResult = await sessionsService.startSession(
        mockSessionId,
        '',
        mockMentorProfileId,
      );
      expect(startResult.status).toBe(SessionStatus.IN_PROGRESS);

      // Mentor can complete
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(inProgressSession as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(completedSession as Session);

      const completeResult = await sessionsService.completeSession(
        mockSessionId,
        mockMentorProfileId,
      );
      expect(completeResult.status).toBe(SessionStatus.COMPLETED);
    });

    it('should prevent unauthorized users from accessing sessions', async () => {
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(mockSession as Session);

      const unauthorizedUserId = '550e8400-e29b-41d4-a716-446655440099';
      const unauthorizedMentorId = '550e8400-e29b-41d4-a716-446655440099';

      // Unauthorized mentee cannot access
      await expect(
        sessionsService.findOne(mockSessionId, unauthorizedUserId),
      ).rejects.toThrow();

      // Unauthorized mentor cannot access
      await expect(
        sessionsService.findOne(mockSessionId, undefined, unauthorizedMentorId),
      ).rejects.toThrow();
    });
  });

  describe('State Transition Validation', () => {
    it('should prevent invalid state transitions', async () => {
      const completedSession = {
        ...mockSession,
        status: SessionStatus.COMPLETED,
      };

      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(completedSession as Session);

      // Cannot start a completed session
      await expect(
        sessionsService.startSession(mockSessionId, mockMenteeUserId),
      ).rejects.toThrow();

      // Cannot complete a scheduled session (must be in_progress first)
      const scheduledSession = { ...mockSession };
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(scheduledSession as Session);

      await expect(
        sessionsService.completeSession(mockSessionId, mockMentorProfileId),
      ).rejects.toThrow();
    });

    it('should allow only forward state transitions', async () => {
      const scheduledSession = { ...mockSession };
      const inProgressSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      // scheduled -> in_progress: allowed
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(scheduledSession as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(inProgressSession as Session);

      const result1 = await sessionsService.startSession(
        mockSessionId,
        mockMenteeUserId,
      );
      expect(result1.status).toBe(SessionStatus.IN_PROGRESS);

      // in_progress -> completed: allowed
      jest
        .spyOn(sessionRepository, 'findOne')
        .mockResolvedValue(inProgressSession as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue({
        ...inProgressSession,
        status: SessionStatus.COMPLETED,
      } as Session);

      const result2 = await sessionsService.completeSession(
        mockSessionId,
        mockMentorProfileId,
      );
      expect(result2.status).toBe(SessionStatus.COMPLETED);
    });
  });

  describe('Timestamp Correctness', () => {
    it('should ensure session timestamps exactly match booking times', async () => {
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(mockBooking);
      jest.spyOn(sessionRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(sessionRepository, 'create').mockReturnValue(mockSession as Session);
      jest.spyOn(sessionRepository, 'save').mockResolvedValue(mockSession as Session);

      await sessionsService.createFromBooking(mockBookingId);

      const createCall = jest.spyOn(sessionRepository, 'create').mock.calls[0][0];
      expect(createCall.startTime).toEqual(mockBooking.startTime);
      expect(createCall.endTime).toEqual(mockBooking.endTime);
      expect(createCall.startTime).toEqual(mockSession.startTime);
      expect(createCall.endTime).toEqual(mockSession.endTime);
    });
  });
});
