import { SetMetadata } from '@nestjs/common';
import { Role } from '../auth.types';

export const ROLES_KEY = 'roles';
/** Restricts a route to wallets holding at least one of the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
