import { IsEnum } from 'class-validator';
import { UserStatus } from '../enums/user-status.enum.js';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}
