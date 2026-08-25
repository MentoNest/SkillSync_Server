import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsString, IsOptional, IsObject } from 'class-validator';

@Entity('audit_logs')
@Index('IDX_audit_logs_userId', ['userId'])
@Index('IDX_audit_logs_action', ['action'])
@Index('IDX_audit_logs_createdAt', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID()
  @IsOptional()
  id: string;

  @Column({ type: 'uuid' })
  @IsUUID()
  userId: string;

  @Column()
  @IsString()
  action: string;

  @Column()
  @IsString()
  entityType: string;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  entityId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  @IsObject()
  @IsOptional()
  details?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
