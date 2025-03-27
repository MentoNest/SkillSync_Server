import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, OneToOne } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Exclude } from 'class-transformer';
import { Role } from 'src/common/enums/Role.enum';
import { Mentor } from 'src/mentors/mentor.entity';
import { Mentee } from 'src/mentees/mentee.entity';
import { Payment } from 'src/payments/payment.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column({
    type: 'enum',
    nullable: false,
    enum: Role,
    default: Role.USER,
  })
  role: Role;

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

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user, {
    cascade: true,
  })
  refreshTokens: RefreshToken[];

  @OneToOne(() => Mentor, (mentor) => mentor.user, { cascade: true })
  mentor?: Mentor;

  @OneToOne(() => Mentee, (mentee) => mentee.user, { cascade: true })
  mentee?: Mentee;

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];
}
