import { Column, CreateDateColumn, Entity, Index, JoinTable, ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../../rbac/entities/role.entity';

/** Minimal account record needed for RBAC; profile fields live in the users PR. */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 56 })
  walletAddress!: string;

  @Column({ type: 'int', default: 0 })
  tokenVersion!: number;

  /** IANA timezone name (e.g. 'America/New_York'); used to render date/time responses. */
  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @ManyToMany(() => Role, (r) => r.users)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
