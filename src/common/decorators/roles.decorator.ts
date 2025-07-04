import { SetMetadata } from '@nestjs/common';
import { userRole } from '../enums/role.enum';


export const ROLES_KEY = 'roles';
export const RolesDecorator = (...roles: userRole[]) => SetMetadata(ROLES_KEY, roles);
