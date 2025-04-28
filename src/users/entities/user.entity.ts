import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { Exclude } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

@Entity('users')
export class User {
  @ApiProperty({ description: 'The unique identifier of the user' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'The email address of the user',
    example: 'user@example.com',
  })
  @Column({ unique: true })
  email: string;

  @ApiProperty({ description: 'The hashed password of the user' })
  @Column()
  @Exclude()
  password: string;

  @ApiProperty({
    description: 'The role of the user',
    enum: Role,
    example: Role.MENTOR,
  })
  @Column({
    type: 'enum',
    enum: Role,
    default: Role.MENTEE,
  })
  role: Role;

  @ApiProperty({ description: 'The date when the user was created' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'The date when the user was last updated' })
  @UpdateDateColumn()
  updatedAt: Date;
}
