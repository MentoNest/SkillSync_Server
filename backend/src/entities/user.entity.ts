import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Role } from './role.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ default: 0 }) // Token version for invalidating old tokens when roles change
  tokenVersion: number;

  @Column({ type: 'varchar', nullable: true, unique: true })
  walletAddress?: string | null;

  @ManyToMany(() => Role, role => role.users, { cascade: true })
  @JoinTable({ name: 'user_roles' }) // Junction table name as required
  roles: Role[];
}