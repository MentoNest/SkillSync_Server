import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
import { BackupService } from '../common/backup/backup.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly shutdownService: GracefulShutdownService,
    private readonly backupService: BackupService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service healthy' })
  @ApiResponse({ status: 503, description: 'Service shutting down' })
  health() {
    const state = this.shutdownService.getState();
    if (state.isShuttingDown) {
      return {
        status: 'shutting_down',
        statusCode: 503,
      };
    }
    return {
      status: 'ok',
      statusCode: 200,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('backup')
  @ApiOperation({ summary: 'Backup status' })
  @ApiResponse({ status: 200, description: 'Backup status retrieved' })
  backupStatus() {
    return this.backupService.getBackupStatus();
  }
}
