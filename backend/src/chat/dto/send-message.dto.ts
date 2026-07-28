import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { MessageType } from '../entities/enums/message-type.enum.js';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;
}
