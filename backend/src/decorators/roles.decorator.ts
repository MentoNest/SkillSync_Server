import { SetMetadata } from '@nestjs/common';
import { RoleName } from '../rbac/role-permissions';

export const ROLES_KEY = 'roles';

/**
 * #1318: restrict a route (or an entire controller) to a set of roles.
 *
 * Guards evaluate the requirement against the roles loaded from the database,
 * taking the role hierarchy into account — an `admin` satisfies
 * `@Roles('mentee')` without holding a `mentee` row.
 *
 * @example
 * ```ts
 * @Controller('sessions')
 * export class SessionController {
 *   @Post()
 *   @Roles(RoleName.MENTOR, RoleName.ADMIN)
 *   create() {}
 * }
 * ```
 */
export const Roles = (...roles: (RoleName | string)[]) => SetMetadata(ROLES_KEY, roles);
