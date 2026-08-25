import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToMany } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string; // admin, mentor, mentee

  @Column()
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToMany(() => User, user => user.roles)
  users: User[];
}