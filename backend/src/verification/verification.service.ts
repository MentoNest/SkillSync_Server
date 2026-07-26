import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VerificationBadge,
  VerificationStatus,
} from './entities/verification-badge.entity.js';
import {
  VerificationAuditLog,
  VerificationAuditAction,
} from './entities/verification-audit-log.entity.js';
import {
  RequestVerificationDto,
  VerifyMentorDto,
  RevokeVerificationDto,
} from './dto/verification.dto.js';

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(VerificationBadge)
    private readonly badgeRepo: Repository<VerificationBadge>,
    @InjectRepository(VerificationAuditLog)
    private readonly auditRepo: Repository<VerificationAuditLog>,
  ) {}

  // ── Mentor-initiated ─────────────────────────────────────────────────────

  /**
   * Mentor requests verification. Creates a PENDING badge (or resubmits if
   * previously revoked).
   */
  async requestVerification(
    mentorId: string,
    dto: RequestVerificationDto,
  ): Promise<VerificationBadge> {
    const existing = await this.badgeRepo.findOne({ where: { mentorId } });

    if (existing) {
      if (existing.status === VerificationStatus.VERIFIED) {
        throw new ConflictException('Mentor is already verified');
      }
      if (existing.status === VerificationStatus.PENDING) {
        throw new ConflictException('Verification request already pending');
      }
      // Re-open from revoked state
      existing.status = VerificationStatus.PENDING;
      existing.verificationMethod = dto.verificationMethod;
      existing.notes = dto.notes ?? existing.notes;
      existing.verifiedAt = null;
      existing.revokedAt = null;
      const saved = await this.badgeRepo.save(existing);
      await this.writeAudit(mentorId, null, VerificationAuditAction.REQUEST_SUBMITTED, {
        method: dto.verificationMethod,
      });
      return saved;
    }

    const badge = this.badgeRepo.create({
      mentorId,
      status: VerificationStatus.PENDING,
      verificationMethod: dto.verificationMethod,
      notes: dto.notes ?? null,
    });
    const saved = await this.badgeRepo.save(badge);
    await this.writeAudit(mentorId, null, VerificationAuditAction.REQUEST_SUBMITTED, {
      method: dto.verificationMethod,
    });
    return saved;
  }

  // ── Admin actions ────────────────────────────────────────────────────────

  /**
   * Admin verifies a mentor (sets badge to VERIFIED).
   * RBAC enforcement expected at the controller/guard layer.
   */
  async verifyMentor(
    mentorId: string,
    adminId: string,
    dto: VerifyMentorDto,
  ): Promise<VerificationBadge> {
    const badge = await this.findOrCreate(mentorId);

    if (badge.status === VerificationStatus.VERIFIED) {
      throw new ConflictException('Mentor is already verified');
    }

    badge.status = VerificationStatus.VERIFIED;
    badge.verificationMethod = dto.verificationMethod;
    badge.verifiedByAdminId = adminId;
    badge.verifiedAt = new Date();
    badge.revokedAt = null;
    if (dto.notes !== undefined) badge.notes = dto.notes;

    const saved = await this.badgeRepo.save(badge);
    await this.writeAudit(mentorId, adminId, VerificationAuditAction.VERIFIED, {
      method: dto.verificationMethod,
    });
    return saved;
  }

  /**
   * Admin revokes a mentor's verification badge.
   */
  async revokeBadge(
    mentorId: string,
    adminId: string,
    dto: RevokeVerificationDto,
  ): Promise<VerificationBadge> {
    const badge = await this.badgeRepo.findOne({ where: { mentorId } });
    if (!badge) {
      throw new NotFoundException('No verification badge found for this mentor');
    }
    if (badge.status !== VerificationStatus.VERIFIED) {
      throw new BadRequestException('Badge is not currently verified');
    }

    badge.status = VerificationStatus.REVOKED;
    badge.revokedAt = new Date();
    badge.verifiedByAdminId = adminId;
    if (dto.notes !== undefined) badge.notes = dto.notes;

    const saved = await this.badgeRepo.save(badge);
    await this.writeAudit(mentorId, adminId, VerificationAuditAction.REVOKED, {
      notes: dto.notes,
    });
    return saved;
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  async getBadge(mentorId: string): Promise<VerificationBadge | null> {
    return this.badgeRepo.findOne({ where: { mentorId } });
  }

  /** Admin dashboard: list all mentors with PENDING verification requests. */
  async getPendingBadges(): Promise<VerificationBadge[]> {
    return this.badgeRepo.find({
      where: { status: VerificationStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async getAuditLog(mentorId: string): Promise<VerificationAuditLog[]> {
    return this.auditRepo.find({
      where: { mentorId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async findOrCreate(mentorId: string): Promise<VerificationBadge> {
    const existing = await this.badgeRepo.findOne({ where: { mentorId } });
    if (existing) return existing;
    return this.badgeRepo.create({ mentorId });
  }

  private async writeAudit(
    mentorId: string,
    adminId: string | null,
    action: VerificationAuditAction,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const log = this.auditRepo.create({ mentorId, adminId, action, metadata });
    await this.auditRepo.save(log);
  }
}
