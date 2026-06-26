import { IsArray, IsEnum } from 'class-validator';
import { AuthRole } from '../../auth/enums/auth-role.enum';

export class UpdateRolesDto {
  @IsArray()
  @IsEnum(AuthRole, { each: true })
  roles: AuthRole[];
}
