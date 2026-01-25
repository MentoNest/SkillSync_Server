import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  threadId!: string;

  @ApiProperty()
  senderId!: string;

  @ApiProperty()
  senderName!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  isRead!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  readAt!: Date | null;
}
