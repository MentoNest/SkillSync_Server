import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';
import { VerificationService } from './verification.service.js';
import {
  RequestVerificationDto,
  VerifyMentorDto,
  RevokeVerificationDto,
} from './dto/verification.dto.js';

/**
 * #997: Verification badge endpoints.
 *
 * Public:
 *   GET /verification/mentors/:mentorId  — read badge status
 *
 * Mentor-authenticated:
 *   POST /verification/request           — submit verification request
 *
 * Admin-only:
 *   POST   /admin/mentors/:mentorId/verify  — grant badge
 *   DELETE /admin/mentors/:mentorId/verify  — revoke badge
 *   GET    /admin/verification/pending      — list pending requests
 *   GET    /admin/mentors/:mentorId/verification/audit — audit log
 */
@Controller()
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  // ── Public ────────────────────────────────────────────────────────────────

  @Get('verification/mentors/:mentorId')
  getBadge(@Param('mentorId', ParseUUIDPipe) mentorId: string) {
    return this.verificationService.getBadge(mentorId);
  }

  // ── Mentor-initiated ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('verification/request')
  requestVerification(
    @Request() req: { user: { sub: string } },
    @Body() dto: RequestVerificationDto,
  ) {
    return this.verificationService.requestVerification(req.user.sub, dto);
  }

  // ── Admin-only ────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @Post('admin/mentors/:mentorId/verify')
  verifyMentor(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Request() req: { user: { sub: string } },
    @Body() dto: VerifyMentorDto,
  ) {
    return this.verificationService.verifyMentor(mentorId, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @Delete('admin/mentors/:mentorId/verify')
  revokeBadge(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Request() req: { user: { sub: string } },
    @Body() dto: RevokeVerificationDto,
  ) {
    return this.verificationService.revokeBadge(mentorId, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @Get('admin/verification/pending')
  getPendingBadges() {
    return this.verificationService.getPendingBadges();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @Get('admin/mentors/:mentorId/verification/audit')
  getAuditLog(@Param('mentorId', ParseUUIDPipe) mentorId: string) {
    return this.verificationService.getAuditLog(mentorId);
  }
}
