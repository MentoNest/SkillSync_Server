import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';
import { MentorProfile } from '../../mentor-profiles/entities/mentor-profile.entity';
import { User } from '../../users/entities/user.entity';

export enum SessionStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

@Entity('sessions')
@Index(['bookingId'], { unique: true })
@Index(['mentorProfileId'])
@Index(['menteeUserId'])
@Index(['status'])
@Index(['startTime'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Booking, (booking: Booking) => booking.session, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'booking_id', unique: true })
  bookingId!: string;

  @ManyToOne(() => MentorProfile, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentor_profile_id' })
  mentorProfile!: MentorProfile;

  @Column({ name: 'mentor_profile_id' })
  mentorProfileId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentee_user_id' })
  menteeUser!: User;

  @Column({ name: 'mentee_user_id' })
  menteeUserId!: string;

  @Column({
    name: 'start_time',
    type: 'timestamp',
  })
  startTime!: Date;

  @Column({
    name: 'end_time',
    type: 'timestamp',
  })
  endTime!: Date;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.SCHEDULED,
  })
  status!: SessionStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
