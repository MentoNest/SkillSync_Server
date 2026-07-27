import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';

/**
 * #994: Portfolio link entity for user profiles.
 *
 * Stores external portfolio links with platform type, URL, and display title.
 * Supports GitHub, LinkedIn, Twitter/X, Personal Website, and more.
 */

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
  OTHER = 'other',
}

@Entity('portfolio_links')
@Index(['userId'])
export class PortfolioLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 56 })
  userId: string;

  @Column({ type: 'enum', enum: PortfolioPlatform })
  platform: PortfolioPlatform;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'verified', type: 'boolean', default: false })
  verified: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
