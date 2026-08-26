import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 42, nullable: true })
  walletAddress: string | null;

  @Index()
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  eventType: string; // 'sessions_revoked', 'login_success', 'login_failed', 'suspicious_login', etc.

  @Index()
  @Column({ type: 'boolean', default: false })
  isSuspicious: boolean;

  @Column({ type: 'text', nullable: true })
  suspiciousReason: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  geoCountry: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  geoCity: string | null;

  @Column({ type: 'float', nullable: true })
  geoLat: number | null;

  @Column({ type: 'float', nullable: true })
  geoLon: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
