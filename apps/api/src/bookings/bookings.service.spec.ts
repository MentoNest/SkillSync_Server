import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './entities/booking.entity';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingRepository: Repository<Booking>;

  const mockBooking = {
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    bookingRepository = module.get<Repository<Booking>>(
      getRepositoryToken(Booking),
    );
  });

  describe('acceptBooking', () => {
    it('should accept a draft booking', async () => {
      const draftBooking = { ...mockBooking };
      const acceptedBooking = { ...draftBooking, status: BookingStatus.ACCEPTED };

      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(draftBooking);
      jest.spyOn(bookingRepository, 'save').mockResolvedValue(acceptedBooking);

      const result = await service.acceptBooking(mockBooking.id);

      expect(result.status).toBe(BookingStatus.ACCEPTED);
      expect(bookingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BookingStatus.ACCEPTED,
        }),
      );
    });

    it('should not accept non-draft booking', async () => {
      const acceptedBooking = {
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
      };

      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(acceptedBooking);

      await expect(
        service.acceptBooking(mockBooking.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent booking', async () => {
      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.acceptBooking('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('declineBooking', () => {
    it('should decline a draft booking', async () => {
      const draftBooking = { ...mockBooking };
      const declinedBooking = { ...draftBooking, status: BookingStatus.DECLINED };

      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(draftBooking);
      jest.spyOn(bookingRepository, 'save').mockResolvedValue(declinedBooking);

      const result = await service.declineBooking(mockBooking.id);

      expect(result.status).toBe(BookingStatus.DECLINED);
      expect(bookingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BookingStatus.DECLINED,
        }),
      );
    });

    it('should not decline non-draft booking', async () => {
      const acceptedBooking = {
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
      };

      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(acceptedBooking);

      await expect(
        service.declineBooking(mockBooking.id),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelBooking', () => {
    it('should cancel a draft booking', async () => {
      const draftBooking = { ...mockBooking };
      const cancelledBooking = { ...draftBooking, status: BookingStatus.CANCELLED };

      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(draftBooking);
      jest.spyOn(bookingRepository, 'save').mockResolvedValue(cancelledBooking);

      const result = await service.cancelBooking(mockBooking.id);

      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('should prevent cancellation of accepted booking', async () => {
      const acceptedBooking = {
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
      };

      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(acceptedBooking);

      await expect(
        service.cancelBooking(mockBooking.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent double cancellation', async () => {
      const cancelledBooking = {
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      };

      jest.spyOn(bookingRepository, 'findOne').mockResolvedValue(cancelledBooking);

      await expect(
        service.cancelBooking(mockBooking.id),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
