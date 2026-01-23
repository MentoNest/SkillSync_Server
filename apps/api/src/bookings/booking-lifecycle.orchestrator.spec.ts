// Ensure @nestjs/testing is installed
// npm install @nestjs/testing --save-dev
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

// Add this line to ensure TypeScript recognizes the module
// @ts-ignore
import { BookingLifecycleOrchestrator } from './booking-lifecycle.orchestrator';
import { BookingsService } from './bookings.service';
import { SessionsService } from '../sessions/sessions.service';
import { Booking, BookingStatus } from './entities/booking.entity';

describe('BookingLifecycleOrchestrator', () => {
  let orchestrator: BookingLifecycleOrchestrator;
  let bookingsService: BookingsService;
  let sessionsService: SessionsService;

  const mockBooking: Booking = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    listingId: '550e8400-e29b-41d4-a716-446655440010',
    mentorProfileId: '550e8400-e29b-41d4-a716-446655440002',
    menteeUserId: '550e8400-e29b-41d4-a716-446655440003',
    startTime: new Date('2026-01-22T10:00:00Z'),
    endTime: new Date('2026-01-22T11:00:00Z'),
    status: BookingStatus.DRAFT,
    notes: null,
    createdAt: new Date('2026-01-22T07:00:00Z'),
    updatedAt: new Date('2026-01-22T07:00:00Z'),
    mentorProfile: undefined,
    menteeUser: undefined,
    listing: undefined,
    session: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingLifecycleOrchestrator,
        {
          provide: BookingsService,
          useValue: {
            acceptBooking: jest.fn(),
            declineBooking: jest.fn(),
            cancelBooking: jest.fn(),
          },
        },
        {
          provide: SessionsService,
          useValue: {
            createFromBooking: jest.fn(),
          },
        },
      ],
    }).compile();

    orchestrator = module.get<BookingLifecycleOrchestrator>(
      BookingLifecycleOrchestrator,
    );
    bookingsService = module.get<BookingsService>(BookingsService);
    sessionsService = module.get<SessionsService>(SessionsService);
  });

  describe('acceptBooking', () => {
    it('should accept booking and create session', async () => {
      const acceptedBooking = {
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
      };

      jest.spyOn(bookingsService, 'acceptBooking').mockResolvedValue(acceptedBooking);
      jest.spyOn(sessionsService, 'createFromBooking').mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        bookingId: mockBooking.id,
        mentorProfileId: mockBooking.mentorProfileId,
        menteeUserId: mockBooking.menteeUserId,
        startTime: mockBooking.startTime,
        endTime: mockBooking.endTime,
        status: 'scheduled',
        notes: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await orchestrator.acceptBooking(mockBooking.id);

      expect(result.status).toBe(BookingStatus.ACCEPTED);
      expect(bookingsService.acceptBooking).toHaveBeenCalledWith(mockBooking.id);
      expect(sessionsService.createFromBooking).toHaveBeenCalledWith(mockBooking.id);
    });

    it('should fail if session creation fails', async () => {
      const acceptedBooking = {
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
      };

      jest.spyOn(bookingsService, 'acceptBooking').mockResolvedValue(acceptedBooking);
      jest
        .spyOn(sessionsService, 'createFromBooking')
        .mockRejectedValue(new Error('Session creation failed'));

      await expect(
        orchestrator.acceptBooking(mockBooking.id),
      ).rejects.toThrow('Session creation failed');
    });
  });

  describe('declineBooking', () => {
    it('should decline booking without creating session', async () => {
      const declinedBooking = {
        ...mockBooking,
        status: BookingStatus.DECLINED,
      };

      jest.spyOn(bookingsService, 'declineBooking').mockResolvedValue(declinedBooking);

      const result = await orchestrator.declineBooking(mockBooking.id);

      expect(result.status).toBe(BookingStatus.DECLINED);
      expect(bookingsService.declineBooking).toHaveBeenCalledWith(mockBooking.id);
      expect(sessionsService.createFromBooking).not.toHaveBeenCalled();
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking', async () => {
      const cancelledBooking = {
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      };

      jest.spyOn(bookingsService, 'cancelBooking').mockResolvedValue(cancelledBooking);

      const result = await orchestrator.cancelBooking(mockBooking.id);

      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(bookingsService.cancelBooking).toHaveBeenCalledWith(mockBooking.id);
    });
  });

  describe('Orchestration', () => {
    it('should coordinate booking acceptance with session creation', async () => {
      const acceptedBooking = {
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
      };

      jest.spyOn(bookingsService, 'acceptBooking').mockResolvedValue(acceptedBooking);
      jest.spyOn(sessionsService, 'createFromBooking').mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        bookingId: mockBooking.id,
        mentorProfileId: mockBooking.mentorProfileId,
        menteeUserId: mockBooking.menteeUserId,
        startTime: mockBooking.startTime,
        endTime: mockBooking.endTime,
        status: 'scheduled',
        notes: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await orchestrator.acceptBooking(mockBooking.id);

      expect(bookingsService.acceptBooking).toHaveBeenCalledWith(mockBooking.id);
      expect(sessionsService.createFromBooking).toHaveBeenCalledWith(mockBooking.id);
    });
  });
});
