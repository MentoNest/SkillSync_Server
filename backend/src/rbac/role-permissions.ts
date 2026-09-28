import { Role } from '../entities/role.entity';

/**
 * #1318: the predefined roles shipped with SkillSync. Additional roles can be
 * created at runtime through the roles API; they simply are not part of the
 * hierarchy below unless they are seeded with an explicit permission list.
 */
export enum RoleName {
  ADMIN = 'admin',
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

/**
 * #1318: hierarchical permissions. A role implicitly grants every role listed
 * against its name, so `admin` satisfies a `@Roles('mentee')` requirement
 * without the user ever holding a `mentee` row.
 */
export const ROLE_HIERARCHY: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [RoleName.ADMIN]: [RoleName.ADMIN, RoleName.MENTOR, RoleName.MENTEE],
  [RoleName.MENTOR]: [RoleName.MENTOR, RoleName.MENTEE],
  [RoleName.MENTEE]: [RoleName.MENTEE],
});

/**
 * #1318: fine grained permissions attached to each predefined role. Stored on
 * the `roles` row as JSONB so new permissions can be introduced without a
 * migration; `'*'` is treated as a wildcard by {@link hasPermission}.
 */
export const ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [RoleName.ADMIN]: ['*'],
  [RoleName.MENTOR]: [
    'profile:read',
    'profile:update',
    'session:read',
    'session:update',
    'booking:create',
    'booking:update',
    'review:create',
    'message:send',
  ],
  [RoleName.MENTEE]: [
    'profile:read',
    'profile:update',
    'session:read',
    'booking:create',
    'message:send',
  ],
});

/** Wildcard granting every permission. */
export const ALL_PERMISSIONS = '*';

/**
 * #1318: the permission catalogue. Permissions are stored as plain strings on
 * the `roles` row, but declaring them here gives `@RequirePermissions()` and
 * role DTO validation a single, typo-proof source of truth.
 */
export enum Permission {
  PROFILE_READ = 'profile:read',
  PROFILE_UPDATE = 'profile:update',
  SESSION_READ = 'session:read',
  SESSION_UPDATE = 'session:update',
  BOOKING_CREATE = 'booking:create',
  BOOKING_UPDATE = 'booking:update',
  REVIEW_CREATE = 'review:create',
  MESSAGE_SEND = 'message:send',
  SKILL_CREATE = 'skill:create',
  SKILL_UPDATE = 'skill:update',
  ROLE_READ = 'role:read',
  ROLE_ASSIGN = 'role:assign',
  ROLE_MANAGE = 'role:manage',
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_SUSPEND = 'user:suspend',
  AUDIT_READ = 'audit:read',
}

/** Every known permission, sorted, for validation and admin UIs. */
export const KNOWN_PERMISSIONS: readonly string[] = Object.freeze(
  Object.values(Permission).sort(),
);

/**
 * True when `value` is either the wildcard or a permission from the catalogue.
 * Used when validating role payloads so typos never end up in the database.
 */
export function isValidPermission(value: string): boolean {
  return value === ALL_PERMISSIONS || KNOWN_PERMISSIONS.includes(value);
}

/** Resource level wildcard, e.g. `session:*`. */
export function isValidResourceWildcard(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 2 && parts[1] === '*' && parts[0].length > 0;
}

/**
 * Returns every role name the given role implicitly inherits, always including
 * the role itself. Unknown roles are returned unchanged so dynamically created
 * roles keep working.
 */
export function expandRoles(roles: readonly string[]): string[] {
  const expanded = new Set<string>();

  for (const role of roles) {
    const inherited = ROLE_HIERARCHY[role];
    if (inherited) {
      inherited.forEach((name) => expanded.add(name));
    } else {
      expanded.add(role);
    }
  }

  return Array.from(expanded);
}

/** True when `heldRole` satisfies a requirement for `requiredRole`. */
export function inheritsRole(heldRole: string, requiredRole: string): boolean {
  if (heldRole === requiredRole) {
    return true;
  }
  return ROLE_HIERARCHY[heldRole]?.includes(requiredRole) ?? false;
}

/**
 * Resolves the effective permission set of a user from the roles they hold,
 * merging the static defaults with the JSONB `permissions` column of each role
 * row (so admins can extend a role without a code change).
 */
export function resolvePermissions(roles: Array<Role | string>): string[] {
  const permissions = new Set<string>();

  for (const role of roles ?? []) {
    const name = typeof role === 'string' ? role : role?.name;
    if (!name) continue;

    // A user inherits the permissions of every role they implicitly hold.
    for (const inherited of expandRoles([name])) {
      ROLE_PERMISSIONS[inherited]?.forEach((permission) => permissions.add(permission));
    }

    if (typeof role !== 'string' && Array.isArray(role?.permissions)) {
      role.permissions.forEach((permission) => permissions.add(permission));
    }
  }

  return Array.from(permissions);
}

/** True when the granted set satisfies the (AND-ed) required permissions. */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes(ALL_PERMISSIONS)) {
    return true;
  }
  // `resource:*` is satisfied by the exact permission as well.
  const [resource] = required.split(':');
  return granted.some(
    (permission) =>
      permission === required || permission === `${resource}:*`,
  );
}

/** True when the granted set satisfies every required permission. */
export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((permission) => hasPermission(granted, permission));
}

/** True when the granted set satisfies at least one required permission. */
export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  return required.some((permission) => hasPermission(granted, permission));
}
