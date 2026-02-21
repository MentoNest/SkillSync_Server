import { UserRole } from '../enums/user-role.enum';

/**
 * Check whether a user's role is in a list of required roles.
 */
export function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole);
}

/**
 * Returns true if the user has the ADMIN role.
 */
export function isAdmin(userRole: UserRole): boolean {
  return userRole === UserRole.ADMIN;
}

/**
 * Returns true if the user has the MENTOR role.
 */
export function isMentor(userRole: UserRole): boolean {
  return userRole === UserRole.MENTOR;
}
