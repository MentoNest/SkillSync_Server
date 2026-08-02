import { AuthRole } from '../enums/auth-role.enum.js';
import { Permission } from '../enums/permission.enum.js';

export const ROLE_PERMISSIONS: Record<AuthRole, Permission[]> = {
  [AuthRole.USER]: [Permission.PROFILE_READ],
  [AuthRole.MENTEE]: [Permission.PROFILE_READ, Permission.MENTEE_PROFILE_WRITE],
  [AuthRole.MENTOR]: [Permission.PROFILE_READ, Permission.MENTOR_PROFILE_WRITE],
  [AuthRole.ADMIN]: [
    Permission.PROFILE_READ,
    Permission.PROFILE_WRITE,
    Permission.MENTOR_PROFILE_WRITE,
    Permission.MENTEE_PROFILE_WRITE,
    Permission.USER_MANAGE,
  ],
};
