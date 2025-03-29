import { Review } from 'src/reviews/review.entity';
import { User } from 'src/users/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, OneToOne, JoinColumn, CreateDateColumn, OneToMany } from 'typeorm';

@Entity()
export class Mentor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bio: string;

  @Column({ type: 'simple-array' })
  skills: string[];

  @Column({ nullable: true })
  availability?: string;

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

  @OneToOne(() => User, (user) => user.mentor, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @OneToMany(() => Review, (review) => review.mentor)
  reviewsReceived: Review[];
}
