import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateNotificationDto {
  @IsUUID()
  userId: string;

  @IsString()
  @IsIn([
    'session_reminder',
    'new_message',
    'profile_verified',
    'suspension_warning',
    'announcement',
  ])
  type: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  body: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;
}
