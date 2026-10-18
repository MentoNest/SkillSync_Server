import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum VerificationRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** A user-initiated request for review by an admin. */
@Entity('mentor_verification_requests')
@Index('IDX_mentor_verification_requests_mentor_id', ['mentorId'])
@Index('IDX_mentor_verification_requests_status', ['status'])
// Admin review queue: pending requests, oldest first (#1463).
@Index('IDX_mentor_verification_requests_status_created', ['status', 'createdAt'])
export class MentorVerificationRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'mentor_id', type: 'uuid' })
  mentorId!: string;

  @Column({ type: 'enum', enum: VerificationRequestStatus, default: VerificationRequestStatus.PENDING })
  status!: VerificationRequestStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
