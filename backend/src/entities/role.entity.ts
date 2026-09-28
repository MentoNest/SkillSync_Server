import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity.js';
import { RoleName, ROLE_PERMISSIONS } from '../rbac/role-permissions';

/**
 * #1318: a role is a named bundle of permissions. The three predefined roles
 * (`admin`, `mentor`, `mentee`) are created by the admin seed; further roles can
 * be added at runtime through the roles API.
 *
 * Permissions live in a JSONB column so the set can be extended per deployment
 * without a migration — see `ROLE_PERMISSIONS` for the shipped defaults.
 */
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_roles_name', { unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  name: string; // admin, mentor, mentee

  @Column({ type: 'varchar', length: 255, default: '' })
  description: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  permissions: string[];

  /**
   * Predefined roles may not be renamed or deleted, which keeps the role
   * hierarchy in `role-permissions.ts` in sync with the database.
   */
  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];

  /** Static permission set shipped for the predefined roles. */
  static defaultPermissionsFor(name: string): string[] {
    return [...(ROLE_PERMISSIONS[name] ?? [])];
  }

  static isPredefined(name: string): name is RoleName {
    return Object.values(RoleName).includes(name as RoleName);
  }
}
