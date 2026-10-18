import type { Repository } from 'typeorm';
import type { User } from '../users/entities/user.entity';
import { RbacService } from './rbac.service';
import type { Role } from './entities/role.entity';
import { RoleName } from './roles';

function role(name: string, permissions: string[]): Partial<Role> {
  return { id: `role-${name}`, name, permissions };
}

function createService(user: Partial<User> | null) {
  const roles = { findOne: jest.fn().mockResolvedValue(null) };
  const users = {
    findOne: jest.fn().mockResolvedValue(user),
    save: jest.fn(async (u: User) => u),
  };
  const service = new RbacService(roles as unknown as Repository<Role>, users as unknown as Repository<User>);
  return { service, roles, users };
}

describe('RbacService', () => {
  describe('claimsFor', () => {
    it('returns the roles and their permissions', async () => {
      const { service } = createService({ roles: [role('mentor', ['profile:read', 'profile:write'])] });

      await expect(service.claimsFor('u1')).resolves.toEqual({
        roles: ['mentor'],
        permissions: ['profile:read', 'profile:write'],
      });
    });

    it('deduplicates permissions granted by several roles', async () => {
      const { service } = createService({
        roles: [role('admin', ['users:read', 'users:write']), role('mentor', ['users:read', 'profile:write'])],
      });

      const claims = await service.claimsFor('u1');

      expect(claims.permissions).toEqual(['users:read', 'users:write', 'profile:write']);
      expect(new Set(claims.permissions).size).toBe(claims.permissions.length);
    });

    it('returns empty claims for a user with no roles', async () => {
      const { service } = createService({ roles: [] });
      await expect(service.claimsFor('u1')).resolves.toEqual({ roles: [], permissions: [] });
    });

    it('returns empty claims rather than throwing for an unknown user', async () => {
      const { service } = createService(null);
      await expect(service.claimsFor('ghost')).resolves.toEqual({ roles: [], permissions: [] });
    });

    it('tolerates a user whose roles relation was not loaded', async () => {
      const { service } = createService({});
      await expect(service.claimsFor('u1')).resolves.toEqual({ roles: [], permissions: [] });
    });
  });

  describe('assignRole', () => {
    it('adds the role to a user that does not have it yet', async () => {
      const mentor = role('mentor', ['profile:read']);
      const user = { id: 'u1', roles: [] as Partial<Role>[] };
      const { service, roles, users } = createService(user);
      roles.findOne.mockResolvedValue(mentor);

      await service.assignRole('u1', RoleName.MENTOR);

      expect(users.save).toHaveBeenCalledWith(expect.objectContaining({ roles: [mentor] }));
    });

    it('is a no-op when the user already holds the role', async () => {
      const mentor = role('mentor', ['profile:read']);
      const user = { id: 'u1', roles: [mentor] as Partial<Role>[] };
      const { service, roles, users } = createService(user);
      roles.findOne.mockResolvedValue(mentor);

      await service.assignRole('u1', RoleName.MENTOR);

      expect(users.save).not.toHaveBeenCalled();
    });

    it('adds a second role without dropping the first', async () => {
      const mentee = role('mentee', ['profile:read']);
      const mentor = role('mentor', ['sessions:book']);
      const user = { id: 'u1', roles: [mentee] as Partial<Role>[] };
      const { service, roles, users } = createService(user);
      roles.findOne.mockResolvedValue(mentor);

      await service.assignRole('u1', RoleName.MENTOR);

      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({ roles: [mentee, mentor] }),
      );
    });

    it('does nothing when the user does not exist', async () => {
      const { service, roles, users } = createService(null);
      roles.findOne.mockResolvedValue(role('mentor', []));

      await service.assignRole('ghost', RoleName.MENTOR);

      expect(users.save).not.toHaveBeenCalled();
    });

    it('does nothing when the role is not seeded', async () => {
      const { service, roles, users } = createService({ id: 'u1', roles: [] });
      roles.findOne.mockResolvedValue(null);

      await service.assignRole('u1', RoleName.MENTOR);

      expect(users.save).not.toHaveBeenCalled();
    });
  });
});