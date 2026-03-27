import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilityService } from '../../src/modules/availability/providers/availability.service';
import { MentorAvailability, DayOfWeek } from '../../src/modules/availability/entities/mentor-availability.entity';
import { MentorProfile } from '../../src/modules/profile/entities/mentor-profile.entity';
import { CreateAvailabilityDto } from '../../src/modules/availability/dto/create-availability.dto';
import { UpdateAvailabilityDto } from '../../src/modules/availability/dto/update-availability.dto';
import {
    NotFoundException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from '@nestjs/common';

describe('AvailabilityService', () => {
    let service: AvailabilityService;
    let availabilityRepo: Repository<MentorAvailability>;
    let mentorProfileRepo: Repository<MentorProfile>;

    const mockAvailabilityRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
    };

    const mockMentorProfileRepo = {
        findOne: jest.fn(),
    };

    const mockUser = { id: 'user-123' };
    const mockMentor = { id: 'mentor-123', user: mockUser };
    const mockSlot = {
        id: 'slot-123',
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '10:00',
        isActive: true,
        mentor: mockMentor,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AvailabilityService,
                {
                    provide: getRepositoryToken(MentorAvailability),
                    useValue: mockAvailabilityRepo,
                },
                {
                    provide: getRepositoryToken(MentorProfile),
                    useValue: mockMentorProfileRepo,
                },
            ],
        }).compile();

        service = module.get<AvailabilityService>(AvailabilityService);
        availabilityRepo = module.get<Repository<MentorAvailability>>(getRepositoryToken(MentorAvailability));
        mentorProfileRepo = module.get<Repository<MentorProfile>>(getRepositoryToken(MentorProfile));

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        const createDto = {
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: '09:00',
            endTime: '10:00',
        };

        it('should create a new availability slot', async () => {
            mockMentorProfileRepo.findOne.mockResolvedValue(mockMentor);
            mockAvailabilityRepo.findOne.mockResolvedValue(null); // No overlap
            mockAvailabilityRepo.create.mockReturnValue(mockSlot);
            mockAvailabilityRepo.save.mockResolvedValue(mockSlot);

            const result = await service.create(createDto, 'user-123');

            expect(result).toEqual(mockSlot);
            expect(mockMentorProfileRepo.findOne).toHaveBeenCalledWith({
                where: { user: { id: 'user-123' } },
            });
            expect(mockAvailabilityRepo.save).toHaveBeenCalled();
        });

        it('should throw NotFoundException if mentor profile is missing', async () => {
            mockMentorProfileRepo.findOne.mockResolvedValue(null);

            await expect(service.create(createDto, 'user-123')).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if startTime >= endTime', async () => {
            mockMentorProfileRepo.findOne.mockResolvedValue(mockMentor);
            const invalidDto = { ...createDto, startTime: '11:00', endTime: '10:00' };

            await expect(service.create(invalidDto, 'user-123')).rejects.toThrow(BadRequestException);
        });

        it('should throw ConflictException if slots overlap', async () => {
            mockMentorProfileRepo.findOne.mockResolvedValue(mockMentor);
            mockAvailabilityRepo.findOne.mockResolvedValue({ id: 'existing-slot' });

            await expect(service.create(createDto, 'user-123')).rejects.toThrow(ConflictException);
        });
    });

    describe('findMySlots', () => {
        it('should return all slots for the current mentor', async () => {
            mockMentorProfileRepo.findOne.mockResolvedValue(mockMentor);
            mockAvailabilityRepo.find.mockResolvedValue([mockSlot]);

            const result = await service.findMySlots('user-123');

            expect(result).toEqual([mockSlot]);
            expect(mockAvailabilityRepo.find).toHaveBeenCalledWith({
                where: { mentor: { id: 'mentor-123' }, isActive: true },
            });
        });
    });

    describe('findByMentorId', () => {
        it('should return sorted slots for a given mentor id', async () => {
            const slots = [
                { dayOfWeek: DayOfWeek.TUESDAY, startTime: '10:00' },
                { dayOfWeek: DayOfWeek.MONDAY, startTime: '11:00' },
                { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00' },
            ];
            mockAvailabilityRepo.find.mockResolvedValue(slots);

            const result = await service.findByMentorId('mentor-123');

            expect(result[0].dayOfWeek).toBe(DayOfWeek.MONDAY);
            expect(result[0].startTime).toBe('09:00');
            expect(result[1].startTime).toBe('11:00');
            expect(result[2].dayOfWeek).toBe(DayOfWeek.TUESDAY);
        });
    });

    describe('update', () => {
        const updateDto: UpdateAvailabilityDto = { startTime: '08:00' };

        it('should update a slot successfully', async () => {
            mockAvailabilityRepo.findOne.mockResolvedValue(mockSlot);
            mockAvailabilityRepo.findOne.mockResolvedValueOnce(mockSlot); // findOneOwned
            mockAvailabilityRepo.findOne.mockResolvedValueOnce(null); // assertNoOverlap
            mockAvailabilityRepo.save.mockResolvedValue({ ...mockSlot, startTime: '08:00' });

            const result = await service.update('slot-123', updateDto, 'user-123');

            expect(result.startTime).toBe('08:00');
            expect(mockAvailabilityRepo.save).toHaveBeenCalled();
        });

        it('should throw ForbiddenException if user does not own the slot', async () => {
            const otherMentorSlot = { ...mockSlot, mentor: { user: { id: 'other-user' } } };
            mockAvailabilityRepo.findOne.mockResolvedValue(otherMentorSlot);

            await expect(service.update('slot-123', updateDto, 'user-123')).rejects.toThrow(ForbiddenException);
        });

        it('should throw NotFoundException if slot does not exist', async () => {
            mockAvailabilityRepo.findOne.mockResolvedValue(null);

            await expect(service.update('slot-123', updateDto, 'user-123')).rejects.toThrow(NotFoundException);
        });
    });

    describe('remove', () => {
        it('should remove a slot successfully', async () => {
            mockAvailabilityRepo.findOne.mockResolvedValue(mockSlot);
            mockAvailabilityRepo.remove.mockResolvedValue(undefined);

            await service.remove('slot-123', 'user-123');

            expect(mockAvailabilityRepo.remove).toHaveBeenCalledWith(mockSlot);
        });
    });
});
