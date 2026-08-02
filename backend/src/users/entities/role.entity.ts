import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuthRole } from '../../common/enums/auth-role.enum.js';
import { User } from './user.entity.js';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AuthRole })
  name: AuthRole;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @ManyToOne(() => User, (user) => user.roles, { onDelete: 'CASCADE' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
