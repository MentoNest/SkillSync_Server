import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum PortfolioPlatform {
  GITHUB = 'github',
  LINKEDIN = 'linkedin',
  TWITTER = 'twitter',
  WEBSITE = 'website',
  BEHANCE = 'behance',
  DRIBBBLE = 'dribbble',
  MEDIUM = 'medium',
  DEVTO = 'devto',
  YOUTUBE = 'youtube',
}

@Index('IDX_portfolio_links_user_id', ['userId'])
@Index('UQ_portfolio_links_user_url', ['userId', 'url'], { unique: true })
@Entity('portfolio_links')
export class PortfolioLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 32 })
  platform!: PortfolioPlatform;

  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'boolean', default: false })
  verified!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
