import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { Role } from './role.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'wallet_address', type: 'varchar', length: 128 })
  walletAddress!: string;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
