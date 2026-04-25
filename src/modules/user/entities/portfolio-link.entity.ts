import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type PortfolioPlatform =
  | 'github'
  | 'linkedin'
  | 'twitter'
  | 'website'
  | 'behance'
  | 'dribbble'
  | 'medium'
  | 'devto'
  | 'youtube'
  | 'other';

@Entity('portfolio_links')
@Index(['userId'])
export class PortfolioLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  url: string; // sanitized https URL

  @Column({ type: 'varchar', default: 'other' })
  platform: PortfolioPlatform;

  @Column({ nullable: true })
  displayTitle: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export const MAX_PORTFOLIO_LINKS = 10;

/** Detect platform from URL hostname. */
export function detectPlatform(url: string): PortfolioPlatform {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('github')) return 'github';
    if (hostname.includes('linkedin')) return 'linkedin';
    if (hostname.includes('twitter') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('behance')) return 'behance';
    if (hostname.includes('dribbble')) return 'dribbble';
    if (hostname.includes('medium')) return 'medium';
    if (hostname.includes('dev.to')) return 'devto';
    if (hostname.includes('youtube')) return 'youtube';
    return 'website';
  } catch {
    return 'other';
  }
}

/** Returns an error message if the URL is invalid, otherwise null. */
export function validatePortfolioUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return 'URL must use https.';
    return null;
  } catch {
    return 'Invalid URL format.';
  }
}
