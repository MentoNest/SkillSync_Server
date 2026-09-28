import {
  ALL_PERMISSIONS,
  KNOWN_PERMISSIONS,
  Permission,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  RoleName,
  expandRoles,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  inheritsRole,
  isValidPermission,
  isValidResourceWildcard,
  resolvePermissions,
} from './role-permissions';

describe('RBAC permission model (#1318)', () => {
  describe('permission catalogue', () => {
    it('is unique, sorted and in the `resource:action` shape', () => {
      expect(KNOWN_PERMISSIONS.length).toBeGreaterThan(0);
      expect(new Set(KNOWN_PERMISSIONS).size).toBe(KNOWN_PERMISSIONS.length);
      expect([...KNOWN_PERMISSIONS].sort()).toEqual(KNOWN_PERMISSIONS);
      for (const permission of KNOWN_PERMISSIONS) {
        expect(permission).toMatch(/^[a-z_]+:[a-z_]+$/);
      }
    });

    it('grants every permission of ROLE_PERMISSIONS to a known one', () => {
      for (const permissions of Object.values(ROLE_PERMISSIONS)) {
        for (const permission of permissions) {
          expect(permission === ALL_PERMISSIONS || isValidPermission(permission)).toBe(true);
        }
      }
    });

    it('accepts catalogue entries, the global wildcard and resource wildcards', () => {
      expect(isValidPermission(Permission.ROLE_MANAGE)).toBe(true);
      expect(isValidPermission(ALL_PERMISSIONS)).toBe(true);
      expect(isValidPermission('session:*')).toBe(false);
      expect(isValidPermission('role:manage_roles')).toBe(false);
      expect(isValidPermission('')).toBe(false);
      expect(isValidResourceWildcard('session:*')).toBe(true);
      expect(isValidResourceWildcard('profile:read')).toBe(false);
    });
  });

  describe('role hierarchy', () => {
    it('lets admin satisfy any role requirement', () => {
      expect(inheritsRole(RoleName.ADMIN, RoleName.MENTEE)).toBe(true);
      expect(inheritsRole(RoleName.ADMIN, RoleName.ADMIN)).toBe(true);
      expect(inheritsRole(RoleName.MENTOR, RoleName.MENTEE)).toBe(true);
      expect(inheritsRole(RoleName.MENTEE, RoleName.MENTOR)).toBe(false);
    });

    it('keeps the hierarchy symmetric for unknown roles only when equal', () => {
      expect(inheritsRole('custom', 'custom')).toBe(true);
      expect(inheritsRole('custom', RoleName.ADMIN)).toBe(false);
    });

    it('expands every predefined role to its full inheritance set', () => {
      expect(expandRoles([RoleName.ADMIN]).sort()).toEqual(
        [RoleName.ADMIN, RoleName.MENTEE, RoleName.MENTOR].sort(),
      );
      expect(expandRoles([RoleName.MENTOR]).sort()).toEqual(
        [RoleName.MENTEE, RoleName.MENTOR].sort(),
      );
      expect(expandRoles([RoleName.MENTEE])).toEqual([RoleName.MENTEE]);
    });

    it('passes unknown roles through so runtime-created roles keep working', () => {
      expect(expandRoles(['moderator'])).toEqual(['moderator']);
    });

    it('deduplicates overlapping hierarchies', () => {
      expect(expandRoles([RoleName.ADMIN, RoleName.MENTOR]).sort()).toEqual(
        [RoleName.ADMIN, RoleName.MENTEE, RoleName.MENTOR].sort(),
      );
    });
  });

  describe('resolvePermissions()', () => {
    it('gives admin the wildcard', () => {
      expect(resolvePermissions([RoleName.ADMIN])).toContain(ALL_PERMISSIONS);
    });

    it('gives a mentor every mentee permission through inheritance', () => {
      const mentor = resolvePermissions([RoleName.MENTOR]);
      const mentee = resolvePermissions([RoleName.MENTEE]);

      for (const permission of mentee) {
        expect(mentor).toContain(permission);
      }
      expect(mentor).toContain(Permission.REVIEW_CREATE);
      expect(mentee).not.toContain(Permission.REVIEW_CREATE);
    });

    it('merges the JSONB permissions stored on a role row', () => {
      const permissions = resolvePermissions([
        { name: RoleName.MENTEE, permissions: ['audit:read', 'user:delete'] } as any,
      ]);

      expect(permissions).toContain('audit:read');
      expect(permissions).toContain('user:delete');
      expect(permissions).toContain(Permission.PROFILE_READ);
    });

    it('returns an empty set for a user without roles', () => {
      expect(resolvePermissions([])).toEqual([]);
    });

    it('ignores malformed role rows', () => {
      expect(resolvePermissions([null as any, { permissions: ['x'] } as any])).toEqual([]);
    });
  });

  describe('hasPermission()', () => {
    it('honours the global wildcard', () => {
      expect(hasPermission([ALL_PERMISSIONS], Permission.USER_DELETE)).toBe(true);
    });

    it('honours a resource wildcard', () => {
      expect(hasPermission(['session:*'], Permission.SESSION_UPDATE)).toBe(true);
      expect(hasPermission(['session:*'], Permission.USER_DELETE)).toBe(false);
    });

    it('requires an exact match otherwise', () => {
      expect(hasPermission([Permission.SESSION_READ], Permission.SESSION_READ)).toBe(true);
      expect(hasPermission([Permission.SESSION_READ], Permission.SESSION_UPDATE)).toBe(false);
      expect(hasPermission([], Permission.SESSION_READ)).toBe(false);
    });
  });

  describe('hasAllPermissions() / hasAnyPermission()', () => {
    const granted = [Permission.PROFILE_READ, Permission.PROFILE_UPDATE];

    it('ANDs hasAllPermissions and ORs hasAnyPermission', () => {
      expect(hasAllPermissions(granted, [Permission.PROFILE_READ, Permission.PROFILE_UPDATE])).toBe(true);
      expect(hasAllPermissions(granted, [Permission.PROFILE_READ, Permission.USER_DELETE])).toBe(false);
      expect(hasAnyPermission(granted, [Permission.USER_DELETE, Permission.PROFILE_READ])).toBe(true);
      expect(hasAnyPermission(granted, [Permission.USER_DELETE])).toBe(false);
    });

    it('is vacuously true/false for an empty requirement list', () => {
      expect(hasAllPermissions(granted, [])).toBe(true);
      expect(hasAnyPermission(granted, [])).toBe(false);
    });
  });

  describe('ROLE_HIERARCHY / ROLE_PERMISSIONS consistency', () => {
    it('only lists defined roles', () => {
      for (const key of Object.keys(ROLE_HIERARCHY)) {
        expect(Object.values(RoleName)).toContain(key);
      }
      for (const key of Object.keys(ROLE_PERMISSIONS)) {
        expect(Object.values(RoleName)).toContain(key);
      }
    });

    it('always lists the role itself in its inheritance set', () => {
      for (const [role, inherited] of Object.entries(ROLE_HIERARCHY)) {
        expect(inherited).toContain(role);
      }
    });
  });
});
