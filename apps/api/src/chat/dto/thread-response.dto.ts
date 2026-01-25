import { ApiProperty } from '@nestjs/swagger';

export class ThreadResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  mentorId!: string;

  @ApiProperty()
  mentorName!: string;

  @ApiProperty()
  menteeId!: string;

  @ApiProperty()
  menteeName!: string;

  @ApiProperty()
  lastMessagePreview!: string | null;

  @ApiProperty()
  lastMessageAt!: Date | null;

  @ApiProperty()
  unreadCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
