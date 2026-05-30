import { ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { AuditEventType } from '../auth/entities/audit-log.entity';
import { UsersService } from './users.service';
import { CreateProfileDto } from './dto/create-profile.dto';

describe('UsersService', () => {
  describe('CreateProfileDto validation', () => {
    it('rejects mentor profile without required mentor fields', async () => {
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'bio')).toBe(true);
      expect(errors.some((error) => error.property === 'expertise')).toBe(true);
      expect(errors.some((error) => error.property === 'yearsOfExperience')).toBe(true);
    });

    it('rejects mentee profile without required mentee fields', async () => {
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTEE;
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'learningGoals')).toBe(true);
      expect(errors.some((error) => error.property === 'areasOfInterest')).toBe(true);
      expect(errors.some((error) => error.property === 'currentSkillLevel')).toBe(true);
      expect(errors.some((error) => error.property === 'timeCommitmentHoursPerWeek')).toBe(true);
    });
  });

  describe('createProfile', () => {
    const user = {
      id: 'user-id-1',
      roles: [{ name: AuthRole.MENTEE }],
    } as any;

    const role = { id: 'role-id', name: AuthRole.MENTOR } as any;

    let service: UsersService;
    let userRepo: any;
    let roleRepo: any;
    let mentorRepo: any;
    let menteeRepo: any;
    let auditLogService: any;

    beforeEach(() => {
      userRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue(user),
      };
      roleRepo = {
        findOne: jest.fn().mockResolvedValue(role),
      };
      mentorRepo = {
        findOne: jest.fn(),
        create: jest.fn().mockImplementation((payload) => payload),
        save: jest.fn().mockImplementation(async (payload) => ({ id: 'mentor-1', ...payload })),
      };
      menteeRepo = {
        findOne: jest.fn(),
        create: jest.fn().mockImplementation((payload) => payload),
        save: jest.fn().mockImplementation(async (payload) => ({ id: 'mentee-1', ...payload })),
      };
      auditLogService = {
        logEvent: jest.fn().mockResolvedValue({ id: 'audit-id' }),
      };
      service = new UsersService(userRepo, roleRepo, mentorRepo, menteeRepo, auditLogService);
    });

    it('throws conflict when mentor profile already exists', async () => {
      mentorRepo.findOne.mockResolvedValue({ id: 'mentor-1' });
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = 'Experienced mentor';
      dto.expertise = ['frontend'];
      dto.yearsOfExperience = 5;

      await expect(service.createProfile(user.id, dto, { ipAddress: null, userAgent: null })).rejects.toThrow(ConflictException);
      expect(mentorRepo.findOne).toHaveBeenCalledWith({ where: { user: { id: user.id } } });
    });

    it('creates a mentor profile and assigns mentor role when none exists', async () => {
      mentorRepo.findOne.mockResolvedValue(null);
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = 'Experienced mentor';
      dto.expertise = ['frontend'];
      dto.yearsOfExperience = 5;

      const result = await service.createProfile(user.id, dto, { ipAddress: '127.0.0.1', userAgent: 'jest' });

      expect(result).toMatchObject({ id: 'mentor-1', bio: 'Experienced mentor', expertise: ['frontend'], yearsOfExperience: 5 });
      expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { name: AuthRole.MENTOR } });
      expect(auditLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, eventType: AuditEventType.PROFILE_CREATED }));
    });

    it('creates a mentee profile and keeps existing mentee role', async () => {
      menteeRepo.findOne.mockResolvedValue(null);
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTEE;
      dto.learningGoals = 'Build confidence';
      dto.areasOfInterest = ['career', 'skills'];
      dto.currentSkillLevel = 'beginner';
      dto.timeCommitmentHoursPerWeek = 3;

      const result = await service.createProfile(user.id, dto, { ipAddress: '127.0.0.1', userAgent: 'jest' });

      expect(result).toMatchObject({ id: 'mentee-1', learningGoals: 'Build confidence', areasOfInterest: ['career', 'skills'], currentSkillLevel: 'beginner' });
      expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { name: AuthRole.MENTEE } });
      expect(auditLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, eventType: AuditEventType.PROFILE_CREATED }));
    });

    it('throws not found when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const dto = new CreateProfileDto();
      dto.profileType = AuthRole.MENTOR;
      dto.bio = 'Test';
      dto.expertise = ['frontend'];
      dto.yearsOfExperience = 5;

      await expect(service.createProfile('bad-user', dto, { ipAddress: null, userAgent: null })).rejects.toThrow(NotFoundException);
    });
  });
});
