import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../../users/entities/user.entity';

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
  OTHER = 'other',
}

@Entity({ name: 'portfolio_links' })
@Index('IDX_portfolio_links_user_id', ['userId'])
export class PortfolioLink {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'varchar', length: 64, default: PortfolioPlatform.OTHER })
  platform!: string;

  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
