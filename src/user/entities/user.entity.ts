import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enum/role.enum';
import { Exclude } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class User {
  @ApiProperty({ description: 'The unique identifier of the user' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'The email address of the user' })
  @Column({ unique: true })
  email: string;

  @Exclude()
  @Column()
  password: string;

  @ApiProperty({ description: 'The role of the user', enum: Role })
  @Column({ type: 'enum', enum: Role })
  role: Role;

  @ApiProperty({ description: 'The full name of the user' })
  @Column({ nullable: true })
  fullName?: string;

  @ApiProperty({ description: 'The bio or description of the user' })
  @Column({ type: 'text', nullable: true })
  bio?: string;

  @ApiProperty({ description: 'The skills or expertise of the user' })
  @Column('text', { array: true, nullable: true })
  skills?: string[];

  @ApiProperty({ description: "URL to the user's profile picture" })
  @Column({ nullable: true })
  profilePicture?: string;

  @ApiProperty({ description: "The user's preferred programming languages" })
  @Column('text', { array: true, nullable: true })
  programmingLanguages?: string[];

  @ApiProperty({ description: 'The creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'The last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;
}
