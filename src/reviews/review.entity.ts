import { Mentee } from 'src/mentees/mentee.entity';
import { Mentor } from 'src/mentors/mentor.entity';
import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, CreateDateColumn, OneToOne, ManyToOne, JoinColumn } from 'typeorm';

@Entity()
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rating: number;

  @Column()
  reviewText: string;

  @CreateDateColumn(
    {
      type: 'timestamptz',
      default: () => 'CURRENT_TIMESTAMP',
    },
  )
  createdAt: Date;

  @UpdateDateColumn(
    {
      type: 'timestamptz',
      default: () => 'CURRENT_TIMESTAMP',
    },
  )
  updatedAt: Date;

  @ManyToOne(() => Mentee, (mentee) => mentee.reviewsGiven)
  @JoinColumn({ name: 'mentee_id' })
  reviewer: Mentee;

  @ManyToOne(() => Mentor, (mentor) => mentor.reviewsReceived)
  @JoinColumn({ name: 'mentor_id' })
  mentor: Mentor;
}
