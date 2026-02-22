import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { IsString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

@Entity('wallets')
export class Wallet {
  @ApiProperty({ description: 'Wallet unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Wallet address', example: 'GABC123...' })
  @IsString()
  @Column({ nullable: false })
  address: string;

  @ApiProperty({ description: 'Whether this is the primary wallet' })
  @IsBoolean()
  @Column({ default: false })
  isPrimary: boolean;

  @ApiProperty({ description: 'When the wallet was linked to the user' })
  @CreateDateColumn()
  linkedAt: Date;

  @ApiProperty({ description: 'User who owns this wallet' })
  @ManyToOne(() => User, user => user.wallets, { onDelete: 'CASCADE' })
  user: User;
}
