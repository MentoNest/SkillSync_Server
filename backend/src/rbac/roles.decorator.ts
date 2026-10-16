import { SetMetadata } from '@nestjs/common';
import { RoleName } from './roles';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

/** Require ANY of the given roles. */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
/** Require ALL of the given permissions. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
