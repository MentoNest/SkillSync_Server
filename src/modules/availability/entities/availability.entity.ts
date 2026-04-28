import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('availability_slots')
@Index(['mentorId'])
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  mentorId: string;

  @Column({ type: 'int' })
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday

  @Column({ type: 'time' })
  startTime: string; // HH:MM in UTC

  @Column({ type: 'time' })
  endTime: string; // HH:MM in UTC

  @Column({ default: 'UTC' })
  timezone: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('availability_exceptions')
@Index(['mentorId'])
export class AvailabilityException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  mentorId: string;

  @Column({ type: 'date' })
  exceptionDate: string; // YYYY-MM-DD

  @Column({ type: 'time', nullable: true })
  startTime: string | null;

  @Column({ type: 'time', nullable: true })
  endTime: string | null;

  @Column({ nullable: true })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
