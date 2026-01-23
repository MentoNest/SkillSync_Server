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
import { ApiProperty } from '@nestjs/swagger';
import { Listing } from '../../listings/entities/listing.entity';
import { MentorProfile } from '../../mentor-profiles/entities/mentor-profile.entity';
import { User } from '../../users/entities/user.entity';
import { Session } from '../../sessions/entities/session.entity';

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
  @ApiProperty({ description: 'The unique identifier of the booking' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'The listing associated with this booking',
  })
  @ManyToOne(() => Listing, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing!: Listing;

  @ApiProperty({ description: 'The ID of the listing' })
  @Column({ name: 'listing_id' })
  listingId!: string;

  @ApiProperty({
    description: 'The mentor profile associated with this booking',
  })
  @ManyToOne(() => MentorProfile, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentor_profile_id' })
  mentorProfile!: MentorProfile;

  @ApiProperty({ description: 'The ID of the mentor profile' })
  @Column({ name: 'mentor_profile_id' })
  mentorProfileId!: string;

  @ApiProperty({ description: 'The user (mentee) who requested the booking' })
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentee_user_id' })
  menteeUser!: User;

  @ApiProperty({ description: 'The ID of the mentee user' })
  @Column({ name: 'mentee_user_id' })
  menteeUserId!: string;

  @ApiProperty({ description: 'The start time of the booking' })
  @Column({
    name: 'start_time',
    type: 'timestamptz',
  })
  startTime!: Date;

  @ApiProperty({ description: 'The end time of the booking' })
  @Column({
    name: 'end_time',
    type: 'timestamptz',
  })
  endTime!: Date;

  @ApiProperty({
    enum: BookingStatus,
    description: 'The status of the booking',
  })
  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.DRAFT,
  })
  status!: BookingStatus;

  @ApiProperty({ description: 'Additional notes for this booking' })
  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ApiProperty({
    description: 'The session associated with this booking',
  })
  @OneToOne(() => Session, (session: Session) => session.booking, {
    nullable: true,
  })
  session?: Session;

  @ApiProperty({ description: 'The date the booking was created' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date the booking was last updated' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
