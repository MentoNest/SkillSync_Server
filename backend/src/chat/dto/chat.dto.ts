import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsValidWalletAddress } from '../../common/validators';
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MAX_MESSAGE_LENGTH,
  MAX_SESSION_ID_LENGTH,
} from '../chat.types';

export class OpenRoomDto {
  @ApiProperty({ description: 'Mentorship session identifier.' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SESSION_ID_LENGTH)
  sessionId!: string;

  @ApiProperty({ description: 'Wallet address of the other participant.' })
  @IsValidWalletAddress()
  participantId!: string;
}

export class RoomRefDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roomId!: string;
}

export class SendMessageDto extends RoomRefDto {
  @ApiProperty({ maxLength: MAX_MESSAGE_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_LENGTH)
  body!: string;
}

export class TypingDto extends RoomRefDto {
  @ApiProperty()
  @IsBoolean()
  isTyping!: boolean;
}

export class AttachmentCaptionDto {
  @ApiPropertyOptional({ maxLength: MAX_MESSAGE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  body?: string;
}

export class QueryMessagesDto {
  @ApiPropertyOptional({
    description: 'Only messages created before this ISO 8601 timestamp.',
  })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_HISTORY_LIMIT,
    default: DEFAULT_HISTORY_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit?: number;
}
