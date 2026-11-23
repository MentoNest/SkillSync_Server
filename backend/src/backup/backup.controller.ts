import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ForbiddenResponseDto, UnauthorizedResponseDto } from '../common/dto/error-response.dto';
import { BackupService } from './backup.service';
import { BackupStatusDto } from './dto/backup-status.dto';

@ApiTags('Admin')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/backups')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get database backup status',
    description:
      'Admin-only. Reports the health of the PostgreSQL backup strategy: the outcome and ' +
      'freshness of the latest run, the retention window, whether encryption and ' +
      'point-in-time recovery are enabled, and the offsite storage target.',
    operationId: 'getBackupStatus',
  })
  @ApiResponse({ status: HttpStatus.OK, type: BackupStatusDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: UnauthorizedResponseDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  getStatus(): Promise<BackupStatusDto> {
    return this.backups.getStatus();
  }
}
