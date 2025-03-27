import { Review } from 'src/reviews/review.entity';
import { User } from 'src/users/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';

@Entity()
export class Mentee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  preferences: string[];

  @Column({ nullable: true })
  goal?: string;

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

  @OneToOne(() => User, (user) => user.mentee, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @OneToMany(() => Review, (review) => review.reviewer)
  reviewsGiven: Review[];
}
