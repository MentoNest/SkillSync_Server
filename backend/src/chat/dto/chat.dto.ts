import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, Min, Max, IsArray, IsBoolean } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  fileType?: string;
}

export class TypingIndicatorDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId!: string;

  @IsBoolean()
  @IsNotEmpty()
  isTyping!: boolean;
}

export class ReadReceiptDto {
  @IsUUID()
  @IsNotEmpty()
  messageId!: string;
}

export class GetMessagesDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}