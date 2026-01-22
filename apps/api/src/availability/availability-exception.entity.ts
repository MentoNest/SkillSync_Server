import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MentorProfile } from '../mentor-profiles/entities/mentor-profile.entity';

@Entity('availability_exceptions')
@Index(['mentorProfile', 'startDate', 'endDate'])
export class AvailabilityException {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => MentorProfile, { onDelete: 'CASCADE' })
  mentorProfile!: MentorProfile;

  // YYYY-MM-DD (mentor timezone)
  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  /**
   * JSONB payload example:
   * {
   *   "type": "FULL_DAY" | "PARTIAL",
   *   "startMinutes": 600,
   *   "endMinutes": 900
   * }
   */
  @Column({ type: 'jsonb' })
  payload!: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;
}
