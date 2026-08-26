import { IsUUID, IsString, MaxLength, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ description: 'Receiver user ID' })
  @IsUUID()
  receiverId: string;

  @ApiPropertyOptional({ description: 'Related session ID' })
  @IsUUID()
  @IsOptional()
  sessionId?: string;

  @ApiProperty({ description: 'Message content' })
  @IsString()
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({ description: 'File attachment URL' })
  @IsUrl()
  @IsOptional()
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'File type (image/png, application/pdf, etc.)' })
  @IsString()
  @IsOptional()
  fileType?: string;
}
