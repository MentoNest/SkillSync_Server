import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
import { MentorProfile } from '../mentor-profiles/entities/mentor-profile.entity';
import { AvailabilitySlot } from '../availability/entities/availability-slot.entity';
import { AvailabilityException } from '../availability/availability-exception.entity';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DateTime } from 'luxon';

const mockBookingRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};

const mockMentorProfileRepo = {
  findOne: jest.fn(),
};

const mockSlotRepo = {
  find: jest.fn(),
};

const mockExceptionRepo = {
  find: jest.fn(),
};

describe('BookingsService', () => {
  let service: BookingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getRepositoryToken(Booking), useValue: mockBookingRepo },
        {
          provide: getRepositoryToken(MentorProfile),
          useValue: mockMentorProfileRepo,
        },
        {
          provide: getRepositoryToken(AvailabilitySlot),
          useValue: mockSlotRepo,
        },
        {
          provide: getRepositoryToken(AvailabilityException),
          useValue: mockExceptionRepo,
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    jest.clearAllMocks();
  });

  describe('createBooking', () => {
    it('should create a booking when valid', async () => {
      const now = DateTime.now()
        .plus({ days: 1 })
        .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
      const start = now.toUTC().toISO();
      const end = now.plus({ minutes: 60 }).toUTC().toISO();

      const mentor = { id: 'mentor-1', userId: 'user-1' } as MentorProfile;
      mockMentorProfileRepo.findOne.mockResolvedValue(mentor);

      // Slot covers 09:00 - 17:00
      mockSlotRepo.find.mockResolvedValue([
        {
          id: 'slot-1',
          weekday: now.weekday,
          startMinutes: 9 * 60,
          endMinutes: 17 * 60,
          timezone: 'UTC',
          active: true,
        },
      ]);
      mockExceptionRepo.find.mockResolvedValue([]);
      mockBookingRepo.findOne.mockResolvedValue(null); // No overlap
      mockBookingRepo.create.mockReturnValue({ id: 'booking-1' });
      mockBookingRepo.save.mockResolvedValue({
        id: 'booking-1',
        status: BookingStatus.REQUESTED,
      });

      const result = await service.createBooking(
        { mentorProfileId: 'mentor-1', start, end },
        'mentee-1',
      );

      expect(result).toBeDefined();
      expect(mockBookingRepo.create).toHaveBeenCalled();
      expect(mockBookingRepo.save).toHaveBeenCalled();
    });

    it('should throw error if outside availability', async () => {
      const now = DateTime.now().plus({ days: 1 }).set({ hour: 20, minute: 0 }); // 8 PM
      const start = now.toUTC().toISO();
      const end = now.plus({ minutes: 60 }).toUTC().toISO();

      const mentor = { id: 'mentor-1' } as MentorProfile;
      mockMentorProfileRepo.findOne.mockResolvedValue(mentor);

      mockSlotRepo.find.mockResolvedValue([
        {
          id: 'slot-1',
          weekday: now.weekday,
          startMinutes: 9 * 60,
          endMinutes: 17 * 60,
          timezone: 'UTC',
          active: true,
        },
      ]);

      await expect(
        service.createBooking(
          { mentorProfileId: 'mentor-1', start, end },
          'mentee-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw conflict if overlaps with accepted booking', async () => {
      const now = DateTime.now().plus({ days: 1 }).set({ hour: 10, minute: 0 });
      const start = now.toUTC().toISO();
      const end = now.plus({ minutes: 60 }).toUTC().toISO();

      const mentor = { id: 'mentor-1' } as MentorProfile;
      mockMentorProfileRepo.findOne.mockResolvedValue(mentor);

      mockSlotRepo.find.mockResolvedValue([
        {
          weekday: now.weekday,
          startMinutes: 9 * 60,
          endMinutes: 17 * 60,
          timezone: 'UTC',
          active: true,
        },
      ]);
      mockExceptionRepo.find.mockResolvedValue([]);

      // Overlap found
      mockBookingRepo.findOne.mockResolvedValue({ id: 'existing-booking' });

      await expect(
        service.createBooking(
          { mentorProfileId: 'mentor-1', start, end },
          'mentee-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateStatus', () => {
    it('should allow mentor to accept', async () => {
      const booking = {
        id: 'booking-1',
        mentorProfileId: 'mentor-1',
        mentorProfile: { userId: 'mentor-user-1' },
        status: BookingStatus.REQUESTED,
        start: new Date(),
        end: new Date(),
      };
      mockBookingRepo.findOne.mockResolvedValue(booking);
      mockBookingRepo.save.mockResolvedValue({
        ...booking,
        status: BookingStatus.ACCEPTED,
      });
      // No overlap
      mockBookingRepo.findOne
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce(null);

      const result = await service.updateStatus(
        'booking-1',
        BookingStatus.ACCEPTED,
        'mentor-user-1',
      );
      expect(result.status).toBe(BookingStatus.ACCEPTED);
    });

    it('should forbid non-mentor from accepting', async () => {
      const booking = {
        id: 'booking-1',
        mentorProfile: { userId: 'mentor-user-1' },
      };
      mockBookingRepo.findOne.mockResolvedValue(booking);

      await expect(
        service.updateStatus('booking-1', BookingStatus.ACCEPTED, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelBooking', () => {
    it('should allow mentee to cancel', async () => {
      const booking = {
        id: 'booking-1',
        menteeUserId: 'mentee-1',
        mentorProfile: { userId: 'mentor-1' },
        status: BookingStatus.REQUESTED,
      };
      mockBookingRepo.findOne.mockResolvedValue(booking);
      mockBookingRepo.save.mockImplementation((b) => Promise.resolve(b));

      const result = await service.cancelBooking('booking-1', 'mentee-1');
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('should forbid unrelated user from cancelling', async () => {
      const booking = {
        id: 'booking-1',
        menteeUserId: 'mentee-1',
        mentorProfile: { userId: 'mentor-1' },
      };
      mockBookingRepo.findOne.mockResolvedValue(booking);

      await expect(
        service.cancelBooking('booking-1', 'random-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
