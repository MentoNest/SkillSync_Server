import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/entities/user.entity';

export enum ProfileType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

@Entity('profile_history')
export class ProfileHistory {
  @ApiProperty({ description: 'History record unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User whose profile was changed' })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @ApiProperty({ description: 'Type of profile', enum: ProfileType })
  @Column({ type: 'enum', enum: ProfileType })
  profileType: ProfileType;

  @ApiProperty({ description: 'Profile ID that was changed' })
  @Column()
  profileId: string;

  @ApiProperty({ description: 'Field name that was changed' })
  @Column()
  fieldName: string;

  @ApiPropertyOptional({ description: 'Previous value of the field' })
  @Column({ type: 'text', nullable: true })
  oldValue: string | null;

  @ApiPropertyOptional({ description: 'New value of the field' })
  @Column({ type: 'text', nullable: true })
  newValue: string | null;

  @ApiPropertyOptional({ description: 'User who made the change (null if system)' })
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn()
  changedBy: User | null;

  @ApiProperty({ description: 'Timestamp when the change was made' })
  @CreateDateColumn()
  createdAt: Date;
}
