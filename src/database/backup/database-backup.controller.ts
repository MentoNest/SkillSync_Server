import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DatabaseBackupService } from './database-backup.service';
import { CreateBackupDto, RestoreBackupDto, BackupStatusDto } from './dto/backup.dto';
import { DatabaseBackup } from './entities/database-backup.entity';

@ApiTags('Database Backup')
@ApiBearerAuth()
@Controller('database/backups')
export class DatabaseBackupController {
  constructor(private readonly backupService: DatabaseBackupService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new database backup' })
  @ApiResponse({ status: 201, description: 'Backup created successfully', type: DatabaseBackup })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createBackup(@Body() dto: CreateBackupDto): Promise<DatabaseBackup> {
    return this.backupService.createBackup(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all backups' })
  @ApiResponse({ status: 200, description: 'List of backups', type: [DatabaseBackup] })
  async listBackups(): Promise<DatabaseBackup[]> {
    return this.backupService.listBackups();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get backup details' })
  @ApiResponse({ status: 200, description: 'Backup details', type: DatabaseBackup })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async getBackup(@Param('id') id: string): Promise<DatabaseBackup> {
    return this.backupService.getBackup(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a backup' })
  @ApiResponse({ status: 204, description: 'Backup deleted successfully' })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async deleteBackup(@Param('id') id: string): Promise<void> {
    return this.backupService.deleteBackup(id);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify backup integrity' })
  @ApiResponse({ status: 200, description: 'Backup verified', type: DatabaseBackup })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async verifyBackup(@Param('id') id: string): Promise<DatabaseBackup> {
    return this.backupService.verifyBackup(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore database from backup' })
  @ApiResponse({ status: 200, description: 'Database restored successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async restoreBackup(
    @Param('id') id: string,
    @Body() dto: RestoreBackupDto,
  ): Promise<{ message: string }> {
    if (!dto.confirm) {
      throw new Error('Confirmation flag is required for restore operation');
    }
    
    await this.backupService.restoreBackup(id, dto.targetTimestamp);
    return { message: 'Database restore initiated successfully' };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get backup system status' })
  @ApiResponse({ status: 200, description: 'Backup status', type: BackupStatusDto })
  async getBackupStatus(): Promise<BackupStatusDto> {
    return this.backupService.getBackupStatus();
  }

  @Post('wal/configure')
  @ApiOperation({ summary: 'Get WAL archiving configuration instructions' })
  @ApiResponse({ status: 200, description: 'WAL configuration instructions provided' })
  async configureWalArchiving(): Promise<{ message: string }> {
    await this.backupService.configureWalArchiving();
    return { message: 'WAL archiving configuration instructions logged' };
  }
}
