import { ApiProperty } from '@nestjs/swagger';
import { SessionStatus } from 'src/common/enums/SessionStatus.enum';

export class CreateSessionDto {
  @ApiProperty({ example: '', description: 'Mentor id' })
  mentorId: string;

  @ApiProperty({ example: '', description: 'Mentee id' })
  menteeId: string;

  @ApiProperty({ example: '', description: 'Session date' })
  sessionDate: Date;

  @ApiProperty({ example: '', description: 'Session duration' })
  duration: number;

  @ApiProperty({ example: 'active', description: 'Session status' })
  status: SessionStatus;
}
