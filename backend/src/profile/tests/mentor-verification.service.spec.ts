import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../auth/auth.types';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { DuplicateResourceException } from '../../common/errors/app-exceptions';
import { ChangeReason } from '../../profile-history/profile-history.entity';
import type { FindManyOptions } from 'typeorm';
import { MentorVerificationAdminController } from '../mentor-verification.controller';
import { MentorProfile } from '../mentor-profile.entity';
import { MentorVerificationService } from '../mentor-verification.service';
import { VerificationMethod } from '../dto/mentor-verification.dto';

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const ADMIN = 'GADMINADMINADMINADMINADMINADMINADMINADMINADMINADMINADM';

function mentor(overrides: Partial<MentorProfile> = {}): MentorProfile {
  return Object.assign(new MentorProfile(), {
    id: 'mentor-uuid',
    walletAddress: WALLET,
    isVerified: false,
    verifiedAt: null,
    verifiedBy: null,
    verificationMethod: null,
    verificationNotes: null,
    verificationRequestedAt: null,
    ...overrides,
  });
}

function makeService(profile: MentorProfile | null = mentor()) {
  const mentors = {
    findOneBy: jest.fn().mockResolvedValue(profile),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findAndCount: jest.fn((options: FindManyOptions<MentorProfile>) => {
      if (!profile || !options.where) {
        return Promise.resolve([[], 0] as [MentorProfile[], number]);
      }
      return Promise.resolve([[profile], 1] as [MentorProfile[], number]);
    }),
  };
  const history = {
    record: jest.fn().mockResolvedValue(undefined),
    recordMany: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new MentorVerificationService(mentors as never, history as never),
    mentors,
    history,
  };
}

describe('MentorVerificationService', () => {
  it('requires a valid verification method before changing status', async () => {
    const { service, mentors } = makeService();

    await expect(
      service.verify('mentor-uuid', ADMIN, {
        method: '' as VerificationMethod,
      }),
    ).rejects.toThrow('A valid verification method is required.');
    expect(mentors.update).not.toHaveBeenCalled();
  });

  it('verifies a mentor, saves internal notes, and audits the status change', async () => {
    const profile = mentor({
      verificationRequestedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const { service, mentors, history } = makeService(profile);

    const result = await service.verify('mentor-uuid', ADMIN, {
      method: VerificationMethod.CREDENTIAL,
      notes: 'Credential reviewed',
    });

    expect(result).toMatchObject({ mentorId: 'mentor-uuid', isVerified: true });
    expect(result.verifiedAt).toBeInstanceOf(Date);
    expect(mentors.update).toHaveBeenCalledWith(
      'mentor-uuid',
      expect.objectContaining({
        isVerified: true,
        verifiedAt: result.verifiedAt,
        verifiedBy: ADMIN,
        verificationMethod: VerificationMethod.CREDENTIAL,
        verificationNotes: 'Credential reviewed',
        verificationRequestedAt: null,
      }),
    );
    expect(history.recordMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'isVerified',
          oldValue: false,
          newValue: true,
          changedBy: ADMIN,
          changeReason: ChangeReason.ADMIN_EDIT,
        }),
      ]),
    );
    expect(result).not.toHaveProperty('verificationNotes');
  });

  it('revokes verification and records an admin audit event', async () => {
    const { service, mentors, history } = makeService(
      mentor({
        isVerified: true,
        verifiedAt: new Date('2026-01-01T00:00:00Z'),
        verifiedBy: ADMIN,
        verificationMethod: VerificationMethod.EMAIL,
        verificationNotes: 'Internal',
      }),
    );

    await expect(service.revoke('mentor-uuid', ADMIN)).resolves.toEqual({
      mentorId: 'mentor-uuid',
      isVerified: false,
    });
    expect(mentors.update).toHaveBeenCalledWith(
      'mentor-uuid',
      expect.objectContaining({
        isVerified: false,
        verifiedAt: null,
        verifiedBy: null,
        verificationMethod: null,
        verificationNotes: null,
      }),
    );
    expect(history.recordMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'isVerified',
          oldValue: true,
          newValue: false,
        }),
      ]),
    );
  });

  it('creates one pending request and makes it visible to admins', async () => {
    const profile = mentor();
    const { service, mentors, history } = makeService(profile);

    const result = await service.requestVerification(WALLET);

    expect(result).toMatchObject({
      mentorId: 'mentor-uuid',
      status: 'pending',
    });
    expect(mentors.update).toHaveBeenCalledWith('mentor-uuid', {
      verificationRequestedAt: result.requestedAt,
    });
    expect(history.record).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldName: 'verificationRequestedAt',
        changedBy: WALLET,
        changeReason: ChangeReason.USER_EDIT,
      }),
    );

    profile.verificationRequestedAt = result.requestedAt;
    const page = await service.getPendingRequests({ page: 1, limit: 20 });
    expect(mentors.findAndCount).toHaveBeenCalled();
    const [findOptions] = mentors.findAndCount.mock.calls[0];
    expect(findOptions).toMatchObject({
      where: { isVerified: false },
      relations: { user: true },
    });
    expect(page.data).toHaveLength(1);
    expect(page.data[0].requestedAt).toEqual(result.requestedAt);
    expect(page.total).toBe(1);
  });

  it('does not duplicate an existing request and rejects requests for verified mentors', async () => {
    const requestedAt = new Date('2026-01-01T00:00:00Z');
    const existing = makeService(
      mentor({ verificationRequestedAt: requestedAt }),
    );
    await expect(
      existing.service.requestVerification(WALLET),
    ).resolves.toMatchObject({
      requestedAt,
      status: 'pending',
    });
    expect(existing.mentors.update).not.toHaveBeenCalled();

    const verified = makeService(mentor({ isVerified: true }));
    await expect(
      verified.service.requestVerification(WALLET),
    ).rejects.toBeInstanceOf(DuplicateResourceException);
  });
});

describe('Mentor verification authorization', () => {
  it('requires the admin role on verification endpoints', () => {
    const context = {
      getHandler: () => () => undefined,
      getClass: () => MentorVerificationAdminController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles: [Role.USER] } }),
      }),
    } as unknown as ExecutionContext;
    const guard = new RolesGuard(new Reflector());

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
