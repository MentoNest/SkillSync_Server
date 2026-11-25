import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('roles')
export class RoleEntity {
  @ApiProperty({ description: 'Role name', example: 'admin' })
  @PrimaryColumn({ type: 'varchar', length: 64 })
  name!: string;

  @ApiProperty({
    description: 'Permissions granted by this role',
    type: [String],
  })
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  permissions!: string[];

  @ApiProperty({ description: 'UTC creation timestamp' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToMany(() => User, (user) => user.roles)
  users?: User[];
}
