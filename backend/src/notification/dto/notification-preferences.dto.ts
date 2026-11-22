import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '../notification.types';

export class NotificationPreferenceUpdateDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceUpdateDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceUpdateDto)
  preferences!: NotificationPreferenceUpdateDto[];
}

export class NotificationPreferenceResponseDto {
  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty()
  enabled!: boolean;
}
