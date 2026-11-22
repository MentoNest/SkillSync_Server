import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';
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
  @ArrayUnique((preference: NotificationPreferenceUpdateDto) => preference.type)
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
