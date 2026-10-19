import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { MAX_HISTORY_LIMIT, MAX_MESSAGE_LENGTH } from '../chat.types';

export class OpenRoomDto {
  @ApiProperty({ format: 'uuid', description: 'The mentor or mentee to chat with' })
  @IsUUID()
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
  @ApiPropertyOptional({ description: 'Only messages created before this time (cursor)' })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_HISTORY_LIMIT, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit?: number;
}
