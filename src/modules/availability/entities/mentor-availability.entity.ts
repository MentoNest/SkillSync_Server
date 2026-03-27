import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MentorProfile } from '../../profile/entities/mentor-profile.entity';

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

@Entity('mentor_availability')
@Index(['mentor', 'dayOfWeek'])
export class MentorAvailability {
  @ApiProperty({ description: 'Availability slot unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Mentor profile this slot belongs to' })
  @ManyToOne(() => MentorProfile, { onDelete: 'CASCADE', eager: false })
  @JoinColumn()
  mentor: MentorProfile;

  @ApiProperty({ description: 'Day of the week', enum: DayOfWeek, example: DayOfWeek.MONDAY })
  @Column({ type: 'enum', enum: DayOfWeek })
  dayOfWeek: DayOfWeek;

  @ApiProperty({
    description: 'Slot start time in HH:MM (24-hour) in the mentor\'s profile timezone',
    example: '09:00',
  })
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  @ApiProperty({
    description: 'Slot end time in HH:MM (24-hour) in the mentor\'s profile timezone',
    example: '11:00',
  })
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  @ApiPropertyOptional({ description: 'Whether this slot is active', default: true })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ description: 'Slot creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Slot last update date' })
  @UpdateDateColumn()
  updatedAt: Date;
}
