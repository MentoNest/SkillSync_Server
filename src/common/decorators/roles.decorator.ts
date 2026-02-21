import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Attach required roles to a route handler or controller class.
 * Used together with RolesGuard to enforce RBAC.
 *
 * @example
 * @Roles(UserRole.ADMIN)
 * @Get('admin-only')
 * adminRoute() {}
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
