import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class User {
  @ApiProperty({ description: 'User ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'User username' })
  @Column()
  username: string;

  @ApiProperty({ description: 'User email' })
  @Column()
  email: string;

  @Column()
  password: string;

  @ApiProperty({ description: 'User role', enum: UserRole })
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.MENTEE,
  })
  role: UserRole;

  @ApiProperty({ description: 'User first name', required: false })
  @Column({ nullable: true })
  firstName: string;

  @ApiProperty({ description: 'User last name', required: false })
  @Column({ nullable: true })
  lastName: string;

  @ApiProperty({ description: 'User address', required: false })
  @Column({ nullable: true })
  address: string;

  @ApiProperty({ description: 'User phone number', required: false })
  @Column({ nullable: true })
  phoneNumber: string;

  @ApiProperty({ description: 'User gender', required: false })
  @Column({ nullable: true })
  gender: string;

  @ApiProperty({ description: 'User about section', required: false })
  @Column({ nullable: true, type: 'text' })
  about: string;

  @ApiProperty({ description: 'User profile picture URL', required: false })
  @Column({ nullable: true })
  profilePicture: string;
}

