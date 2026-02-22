import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums/user-role.enum';
import { Wallet } from './wallet.entity';

@Entity('users')
@Index(['email'], { unique: true })
export class User {
  @ApiProperty({ description: 'User unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  @IsEmail()
  @Column({ unique: true, nullable: false })
  email: string;

  @ApiProperty({ description: 'Hashed password' })
  @IsString()
  @MinLength(6)
  @Column({ nullable: false, select: false })
  passwordHash: string;

  @ApiPropertyOptional({ description: 'User first name', example: 'John' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  firstName?: string;

  @ApiPropertyOptional({ description: 'User last name', example: 'Doe' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  lastName?: string;

  @ApiProperty({ description: 'User role', enum: UserRole })
  @IsEnum(UserRole)
  @Column({ type: 'enum', enum: UserRole, default: UserRole.MENTEE })
  role: UserRole;

  @ApiProperty({ description: 'Whether the user account is active' })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ description: 'User wallets' })
  @OneToMany(() => Wallet, wallet => wallet.user, { cascade: true })
  wallets: Wallet[];

  @ApiProperty({ description: 'Account creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last account update date' })
  @UpdateDateColumn()
  updatedAt: Date;

  /** 
   * @deprecated Use wallets array instead. 
   * For backward compatibility, this returns the primary wallet address if available.
   */
  get publicKey(): string | undefined {
    return this.wallets?.find(w => w.isPrimary)?.address;
  }
}

