import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { MentorProfile } from '../users/entities/mentor-profile.entity';
import { VerificationMethod } from './dto/mentor-verification.dto';
import {
  MentorVerificationRequest,
  VerificationRequestStatus,
} from './entities/mentor-verification-request.entity';
import { MentorVerificationService } from './mentor-verification.service';

describe('MentorVerificationService', () => {
  let service: MentorVerificationService;
  const profiles = { findOne: jest.fn(), save: jest.fn() };
  const requests = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn() };
  const audit = { record: jest.fn() };

  const profile = (over: Partial<MentorProfile> = {}): MentorProfile =>
    ({ id: 'p1', userId: 'm1', isVerified: false, verifiedAt: null, verificationMethod: null, ...over }) as MentorProfile;

  beforeEach(async () => {
    jest.clearAllMocks();
    audit.record.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorVerificationService,
        { provide: getRepositoryToken(MentorProfile), useValue: profiles },
        { provide: getRepositoryToken(MentorVerificationRequest), useValue: requests },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(MentorVerificationService);
  });

  describe('verify', () => {
    it('requires a verification method', async () => {
      await expect(service.verify('m1', 'admin', {} as never)).rejects.toThrow();
    });

    it('throws when the profile does not exist', async () => {
      profiles.findOne.mockResolvedValue(null);
      await expect(service.verify('m1', 'admin', { method: VerificationMethod.EMAIL })).rejects.toThrow();
    });

    it('sets the verification fields and writes an audit entry', async () => {
      const p = profile();
      profiles.findOne.mockResolvedValue(p);
      profiles.save.mockImplementation(async (v) => v);
      requests.update.mockResolvedValue({ affected: 1 });

      const result = await service.verify('m1', 'admin', { method: VerificationMethod.ID, notes: 'checked' });

      expect(result.isVerified).toBe(true);
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(result.verifiedBy).toBe('admin');
      expect(result.verificationMethod).toBe('id');
      expect(result.verificationNotes).toBe('checked');
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('clears the verification state and audits', async () => {
      const p = profile({ isVerified: true, verifiedAt: new Date(), verificationMethod: 'email' });
      profiles.findOne.mockResolvedValue(p);
      profiles.save.mockImplementation(async (v) => v);

      const result = await service.revoke('m1', 'admin');

      expect(result.isVerified).toBe(false);
      expect(result.verifiedAt).toBeNull();
      expect(result.verificationMethod).toBeNull();
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('requestVerification', () => {
    it('rejects an already verified mentor', async () => {
      profiles.findOne.mockResolvedValue(profile({ isVerified: true }));
      await expect(service.requestVerification('m1')).rejects.toThrow();
    });

    it('creates a pending request', async () => {
      profiles.findOne.mockResolvedValue(profile());
      requests.findOne.mockResolvedValue(null);
      requests.create.mockImplementation((v) => v);
      requests.save.mockImplementation(async (v) => ({ ...v, id: 'r1' }));

      const result = await service.requestVerification('m1', { note: 'please' });
      expect(result.status).toBe(VerificationRequestStatus.PENDING);
      expect(audit.record).toHaveBeenCalled();
    });

    it('reuses an existing pending request', async () => {
      profiles.findOne.mockResolvedValue(profile());
      const existing = { id: 'r1', mentorId: 'm1', status: VerificationRequestStatus.PENDING };
      requests.findOne.mockResolvedValue(existing);

      await expect(service.requestVerification('m1')).resolves.toBe(existing);
      expect(requests.save).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('returns a badge for verified mentors', async () => {
      profiles.findOne.mockResolvedValue(profile({ isVerified: true, verifiedAt: new Date('2024-01-01T00:00:00Z'), verificationMethod: 'id' }));
      const status = await service.status('m1');
      expect(status.badge).toBe('verified');
      expect(status.isVerified).toBe(true);
    });

    it('returns an unverified badge otherwise', async () => {
      profiles.findOne.mockResolvedValue(profile());
      const status = await service.status('m1');
      expect(status.badge).toBe('unverified');
    });
  });
});
