import { Controller, Get, UseGuards } from '@nestjs/common';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../jwt-auth.guard';

/**
 * Admin-only backup status endpoint.
 * Requires a valid JWT. In production, scope this further with a roles guard.
 */
@Controller('admin/backup')
@UseGuards(JwtAuthGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /**
   * GET /admin/backup/status
   *
   * Returns the status of the most recent automated backup, the next
   * scheduled backup time, and the configured retention policy.
   */
  @Get('status')
  async getStatus() {
    return this.backupService.getStatus();
  }
}
