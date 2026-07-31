import { IsEnum, IsUUID } from 'class-validator';
import { AuthRole } from '../../common/enums/auth-role.enum.js';

export class AssignRoleDto {
  @IsEnum(AuthRole)
  role!: AuthRole;

  @IsUUID()
  userId!: string;
}
