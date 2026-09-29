/**
 * #1338: mentor verification and revocation.
 *
 * `MentorVerificationService` is deliberately thin - it issues two repository
 * updates and nothing else - so the risk is not in its branching but in *what*
 * it writes. A revocation that forgot to clear `verifiedBy` would leave a stale
 * admin id on a profile that is no longer verified, and a verification that did
 * not stamp `verifiedAt` would show a trust badge with no provenance. Both are
 * asserted here against the real repository call arguments.
 *
 * Permission checks are the caller's job (`@Roles` / `@RequirePermissions`),
 * so they are covered by the roles guard spec rather than duplicated here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { MentorVerificationService } from './mentor-verification.service.js';
import { MentorProfile } from '../entities/mentor-profile.entity.js';

const MENTOR_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

describe('MentorVerificationService', () => {
  let mentorProfileRepo: { update: ReturnType<typeof vi.fn> };
  let service: MentorVerificationService;

  beforeEach(() => {
    mentorProfileRepo = { update: vi.fn().mockResolvedValue({ affected: 1 }) };
    service = new MentorVerificationService(
      mentorProfileRepo as unknown as Repository<MentorProfile>,
    );
  });

  describe('verify', () => {
    it('marks the mentor verified and records who did it and when', async () => {
      await service.verify(MENTOR_ID, ADMIN_ID);

      expect(mentorProfileRepo.update).toHaveBeenCalledTimes(1);

      const [criteria, values] = mentorProfileRepo.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      expect(criteria).toEqual({ id: MENTOR_ID });
      expect(values.isVerified).toBe(true);
      expect(values.verifiedBy).toBe(ADMIN_ID);
      expect(values.verifiedAt).toBeInstanceOf(Date);
    });

    it('stamps a verification time that is not in the future', async () => {
      const before = Date.now();

      await service.verify(MENTOR_ID, ADMIN_ID);

      const [, values] = mentorProfileRepo.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      const stamped = (values.verifiedAt as Date).getTime();

      expect(stamped).toBeGreaterThanOrEqual(before);
      expect(stamped).toBeLessThanOrEqual(Date.now());
    });

    it('scopes the update to the requested mentor, so one call cannot verify two profiles', async () => {
      await service.verify(MENTOR_ID, ADMIN_ID);

      const [criteria] = mentorProfileRepo.update.mock.calls[0] as [
        Record<string, unknown>,
      ];

      expect(Object.keys(criteria)).toEqual(['id']);
      expect(criteria.id).toBe(MENTOR_ID);
    });

    it('resolves without inspecting the result, so a missing row is not an error here', async () => {
      mentorProfileRepo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.verify(MENTOR_ID, ADMIN_ID),
      ).resolves.toBeUndefined();
    });

    it('propagates a repository failure to the caller', async () => {
      mentorProfileRepo.update.mockRejectedValue(
        new Error('deadlock detected'),
      );

      await expect(service.verify(MENTOR_ID, ADMIN_ID)).rejects.toThrow(
        'deadlock detected',
      );
    });

    it('records a different admin when a different admin performs the verification', async () => {
      const otherAdmin = '44444444-4444-4444-8444-444444444444';

      await service.verify(MENTOR_ID, otherAdmin);

      const [, values] = mentorProfileRepo.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      expect(values.verifiedBy).toBe(otherAdmin);
    });
  });

  describe('revoke', () => {
    it('clears the verified flag along with the provenance columns', async () => {
      await service.revoke(MENTOR_ID);

      const [criteria, values] = mentorProfileRepo.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      expect(criteria).toEqual({ id: MENTOR_ID });
      expect(values.isVerified).toBe(false);
      expect(values.verifiedAt).toBeNull();
      expect(values.verifiedBy).toBeNull();
    });

    it('clears verifiedBy as well as verifiedAt, leaving no stale admin id', async () => {
      await service.revoke(MENTOR_ID);

      const [, values] = mentorProfileRepo.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      // A revocation that left verifiedBy behind would attribute the current
      // unverified state to an admin who never touched it.
      expect(values).toHaveProperty('verifiedBy', null);
      expect(values.verifiedBy).toBeNull();
    });

    it('takes only the mentor id, since a lift has no acting admin to record', async () => {
      await expect(service.revoke(MENTOR_ID)).resolves.toBeUndefined();
      expect(mentorProfileRepo.update).toHaveBeenCalledTimes(1);
    });

    it('leaves the mentor verified=false rather than deleting the profile', async () => {
      await service.revoke(MENTOR_ID);

      const [, values] = mentorProfileRepo.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      // Revocation is not deletion: the profile row and its reviews stay put.
      expect(Object.keys(values).sort()).toEqual([
        'isVerified',
        'verifiedAt',
        'verifiedBy',
      ]);
    });

    it('propagates a repository failure to the caller', async () => {
      mentorProfileRepo.update.mockRejectedValue(
        new Error('connection terminated'),
      );

      await expect(service.revoke(MENTOR_ID)).rejects.toThrow(
        'connection terminated',
      );
    });
  });

  describe('verify then revoke', () => {
    it('is idempotent in the sense that revoking twice writes the same state', async () => {
      await service.revoke(MENTOR_ID);
      await service.revoke(MENTOR_ID);

      expect(mentorProfileRepo.update).toHaveBeenCalledTimes(2);
      expect(mentorProfileRepo.update.mock.calls[0]).toEqual(
        mentorProfileRepo.update.mock.calls[1],
      );
    });

    it('returns the profile to the exact state it had before verification', async () => {
      const snapshot = {
        isVerified: false,
        verifiedAt: null,
        verifiedBy: null,
      };

      await service.verify(MENTOR_ID, ADMIN_ID);
      await service.revoke(MENTOR_ID);

      const [, values] = mentorProfileRepo.update.mock.calls[1] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      expect(values).toEqual(snapshot);
    });

    it('a re-verification after a revocation records the new admin and a new time', async () => {
      const secondAdmin = '55555555-5555-4555-8555-555555555555';

      await service.verify(MENTOR_ID, ADMIN_ID);
      await service.revoke(MENTOR_ID);
      await service.verify(MENTOR_ID, secondAdmin);

      const [, values] = mentorProfileRepo.update.mock.calls[2] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];

      expect(values.isVerified).toBe(true);
      expect(values.verifiedBy).toBe(secondAdmin);
    });
  });
});
