import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { Listing } from '../../listings/entities/listing.entity';
import { MentorProfile } from '../../mentor-profiles/entities/mentor-profile.entity';
import { User } from '../../users/entities/user.entity';
import { Session } from '../../sessions/entities/session.entity';

// Ensure 'typeorm' is installed and the types are available.
// If using npm:
// npm install typeorm @types/typeorm
// If using yarn:
// yarn add typeorm @types/typeorm

export enum BookingStatus {
  DRAFT = 'draft',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}

@Entity('bookings')
@Index(['listingId'])
@Index(['menteeUserId'])
@Index(['mentorProfileId'])
@Index(['status'])
@Index(['startTime'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Listing, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing!: Listing;

  @Column({ name: 'listing_id' })
  listingId!: string;

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
    enum: BookingStatus,
    default: BookingStatus.DRAFT,
  })
  status!: BookingStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToOne(() => Session, (session: Session) => session.booking, { nullable: true })
  session?: Session;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
