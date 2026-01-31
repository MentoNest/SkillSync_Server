import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  Unique,
} from 'typeorm';
import { User } from '@/users/entities/user.entity';
import { Session } from '@/sessions/entities/session.entity';



@Entity('reviews')
@Unique(['session', 'reviewer'])
@Index(['session', 'reviewer'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mentee */
  @ManyToOne(() => User, { eager: false })
  reviewer: User;

  /** Mentor */
  @ManyToOne(() => User, { eager: false })
  reviewee: User;

  @ManyToOne(() => Session, { eager: false })
  session: Session;

  @Column({ type: 'int' })
  rating: number; // 1–5

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @CreateDateColumn()
  createdAt: Date;
}
