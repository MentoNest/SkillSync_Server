import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { MentorProfile } from '../../mentor-profiles/entities/mentor-profile.entity';
import { User } from '../../users/entities/user.entity';

export enum BookingStatus {
  REQUESTED = 'requested',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}

@Entity('bookings')
@Index(['mentorProfile', 'start', 'end'])
@Index(['menteeUser'])
@Index(['status'])
export class Booking {
  @ApiProperty({ description: 'The unique identifier of the booking' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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
  @Column({ type: 'timestamptz' })
  start!: Date;

  @ApiProperty({ description: 'The end time of the booking' })
  @Column({ type: 'timestamptz' })
  end!: Date;

  @ApiProperty({
    enum: BookingStatus,
    description: 'The status of the booking',
  })
  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.REQUESTED,
  })
  status!: BookingStatus;

  @ApiProperty({ description: 'The date the booking was created' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date the booking was last updated' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
