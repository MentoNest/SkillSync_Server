import { Column, Entity, PrimaryGeneratedColumn, ManyToMany } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  name!: string;

  /** Permission strings such as "users:read". */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  permissions!: string[];

  @ManyToMany(() => User, (u) => u.roles)
  users?: User[];
}
