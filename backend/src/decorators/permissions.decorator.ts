import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * #1318: restrict a route to holders of fine grained permissions rather than
 * to whole roles. All listed permissions must be granted (AND semantics);
 * `admin` holds the `*` wildcard and therefore always passes.
 *
 * @example
 * ```ts
 * @Patch(':id')
 * @RequirePermissions('session:update')
 * update() {}
 * ```
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
