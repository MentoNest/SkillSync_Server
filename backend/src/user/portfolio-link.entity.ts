import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum PortfolioPlatform {
  GITHUB = 'github',
  LINKEDIN = 'linkedin',
  TWITTER = 'twitter',
  PERSONAL_WEBSITE = 'personal_website',
  BEHANCE = 'behance',
  DRIBBBLE = 'dribbble',
  MEDIUM = 'medium',
  DEVTO = 'devto',
  YOUTUBE = 'youtube',
}

@Entity('portfolio_links')
@Index('idx_portfolio_links_wallet', ['walletAddress'])
@Index('uq_portfolio_links_wallet_url', ['walletAddress', 'url'], { unique: true })
export class PortfolioLink {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty()
  @Column({ name: 'wallet_address', type: 'varchar', length: 56 })
  walletAddress!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_address', referencedColumnName: 'walletAddress' })
  user?: User;

  @ApiProperty({ enum: PortfolioPlatform })
  @Column({ type: 'enum', enum: PortfolioPlatform, enumName: 'portfolio_platform_enum' })
  platform!: PortfolioPlatform;

  @ApiProperty()
  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @ApiPropertyOptional({ nullable: true })
  @Column({ name: 'display_title', type: 'varchar', length: 120, nullable: true })
  displayTitle!: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt!: Date;
}
