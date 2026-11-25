import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserStatus } from '../user-status.enum';

export class UpdateUserStatusDto {
  @ApiProperty({
    description:
      'New account status. Restores soft-deleted accounts to active when set to "active".',
    enum: UserStatus,
    example: UserStatus.SUSPENDED,
  })
  @IsEnum(UserStatus)
  status!: UserStatus;
}
