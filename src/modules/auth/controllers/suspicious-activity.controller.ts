import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SuspiciousLoginDetectionService } from '../services/suspicious-login-detection.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { User, UserRole } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';

/**
 * Query parameters for suspicious activity report
 */
export class GetSuspiciousActivityDto {
  startDate?: Date;
  endDate?: Date;
  country?: string;
  onlyLocked?: boolean;
  limit?: number = 100;
}

/**
 * Query parameters for login history
 */
export class GetLoginHistoryDto {
  limit?: number = 50;
}

/**
 * Unlock account request body
 */
export class UnlockAccountDto {
  walletAddress: string;
  reason?: string;
}

/**
 * Admin controller for suspicious activity monitoring
 * Provides dashboards and APIs for security monitoring
 */
@ApiTags('admin', 'security')
@Controller('admin/security')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR)
export class SuspiciousActivityController {
  constructor(
    private suspiciousLoginDetectionService: SuspiciousLoginDetectionService,
  ) {}

  /**
   * Get suspicious activity report
   * Returns all suspicious login attempts and locked accounts
   */
  @Get('suspicious-activities')
  @ApiOperation({
    summary: 'Get suspicious activity report',
    description: 'Returns suspicious login attempts with filtering options',
  })
  @ApiResponse({
    status: 200,
    description: 'Suspicious activity report',
    schema: {
      properties: {
        totalSuspiciousActivities: { type: 'number' },
        activities: {
          type: 'array',
          items: { $ref: '#/components/schemas/AuditLog' },
        },
        lockedAccounts: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async getSuspiciousActivities(
    @Query() query: GetSuspiciousActivityDto,
  ) {
    // Validate date range
    if (query.startDate && query.endDate) {
      if (new Date(query.startDate) > new Date(query.endDate)) {
        throw new BadRequestException('startDate must be before endDate');
      }

      // Max 90 days
      const diffDays =
        (new Date(query.endDate).getTime() -
          new Date(query.startDate).getTime()) /
        (1000 * 60 * 60 * 24);
      if (diffDays > 90) {
        throw new BadRequestException('Date range cannot exceed 90 days');
      }
    }

    // Limit query results
    const limit = Math.min(query.limit || 100, 1000);

    return await this.suspiciousLoginDetectionService.getSuspiciousActivityReport(
      {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        country: query.country,
        onlyLocked: query.onlyLocked,
        limit,
      },
    );
  }

  /**
   * Get login history for specific wallet
   * Shows all login attempts (successful and failed)
   */
  @Get('login-history/:walletAddress')
  @ApiOperation({
    summary: 'Get login history for wallet',
    description: 'Returns all login attempts for a specific wallet address',
  })
  @ApiResponse({
    status: 200,
    description: 'Login history',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/AuditLog' },
    },
  })
  async getLoginHistory(
    @Param('walletAddress') walletAddress: string,
    @Query() query: GetLoginHistoryDto,
  ): Promise<AuditLog[]> {
    const limit = Math.min(query.limit || 50, 500);
    return await this.suspiciousLoginDetectionService.getLoginHistory(
      walletAddress,
      limit,
    );
  }

  /**
   * Get IP history for wallet
   * Shows geographic locations of login attempts
   */
  @Get('ip-history/:walletAddress')
  @ApiOperation({
    summary: 'Get IP history for wallet',
    description: 'Returns login locations and IP addresses for a wallet',
  })
  @ApiResponse({
    status: 200,
    description: 'IP history',
    schema: {
      type: 'array',
      items: {
        properties: {
          ipAddress: { type: 'string' },
          country: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          timestamp: { type: 'number' },
          success: { type: 'boolean' },
        },
      },
    },
  })
  async getIPHistory(
    @Param('walletAddress') walletAddress: string,
  ) {
    return await this.suspiciousLoginDetectionService.getIPHistory(
      walletAddress,
    );
  }

  /**
   * Check if wallet is locked
   * Returns account lockout status
   */
  @Get('account-status/:walletAddress')
  @ApiOperation({
    summary: 'Check account lockout status',
    description: 'Check if account is locked due to suspicious activity',
  })
  @ApiResponse({
    status: 200,
    description: 'Account status',
    schema: {
      properties: {
        isLocked: { type: 'boolean' },
      },
    },
  })
  async getAccountStatus(
    @Param('walletAddress') walletAddress: string,
  ) {
    const isLocked = await this.suspiciousLoginDetectionService.isAccountLocked(
      walletAddress,
    );

    return {
      walletAddress,
      isLocked,
    };
  }

  /**
   * Manually unlock an account
   * Admin only operation
   */
  @Post('unlock-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unlock account',
    description: 'Manually unlock an account locked due to suspicious activity',
  })
  @ApiResponse({
    status: 200,
    description: 'Account unlocked successfully',
  })
  async unlockAccount(
    @Body() dto: UnlockAccountDto,
    @CurrentUser() admin: User,
  ) {
    // Additional admin verification
    if (admin.roles.some((r) => r.name === UserRole.ADMIN)) {
      // Only ADMIN can unlock, not MODERATOR
      // This is a security decision - adjust as needed
    } else {
      throw new ForbiddenException('Only administrators can unlock accounts');
    }

    await this.suspiciousLoginDetectionService.unlockAccount(dto.walletAddress);

    return {
      success: true,
      message: `Account ${dto.walletAddress} has been unlocked`,
    };
  }

  /**
   * Get suspicious activity statistics
   * Dashboard overview
   */
  @Get('statistics')
  @ApiOperation({
    summary: 'Get security statistics',
    description: 'Returns overview statistics about suspicious activities',
  })
  @ApiResponse({
    status: 200,
    description: 'Security statistics',
    schema: {
      properties: {
        totalSuspiciousActivitiesLast24h: { type: 'number' },
        totalLockedAccounts: { type: 'number' },
        topCountriesWithSuspiciousActivity: {
          type: 'array',
          items: {
            properties: {
              country: { type: 'string' },
              count: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getSecurityStatistics() {
    const report = await this.suspiciousLoginDetectionService.getSuspiciousActivityReport(
      {
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        limit: 1000,
      },
    );

    // Calculate statistics
    const countryStats: Record<string, number> = {};
    report.activities.forEach((activity) => {
      if (activity.country) {
        countryStats[activity.country] = (countryStats[activity.country] || 0) + 1;
      }
    });

    const topCountries = Object.entries(countryStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }));

    return {
      totalSuspiciousActivitiesLast24h: report.activities.length,
      totalLockedAccounts: report.lockedAccounts.length,
      topCountriesWithSuspiciousActivity: topCountries,
    };
  }

  /**
   * Export suspicious activities as CSV
   * For reporting and compliance
   */
  @Get('export')
  @ApiOperation({
    summary: 'Export suspicious activities',
    description: 'Export suspicious activities as CSV file',
  })
  @ApiResponse({
    status: 200,
    description: 'CSV file',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  async exportSuspiciousActivities(
    @Query() query: GetSuspiciousActivityDto,
  ) {
    const report = await this.suspiciousLoginDetectionService.getSuspiciousActivityReport(
      query,
    );

    // Convert to CSV
    const csv = this.convertToCSV(report.activities);

    return {
      filename: `suspicious-activities-${Date.now()}.csv`,
      content: csv,
      mimeType: 'text/csv',
    };
  }

  // ==================== Helper Methods ====================

  private convertToCSV(activities: AuditLog[]): string {
    const headers = [
      'ID',
      'Wallet Address',
      'Event Type',
      'IP Address',
      'Country',
      'Risk Score',
      'Suspicious Reasons',
      'Date',
    ];

    const rows = activities.map((activity) => [
      activity.id,
      activity.walletAddress,
      activity.eventType,
      activity.ipAddress,
      activity.country || 'Unknown',
      activity.metadata?.riskScore || 0,
      (activity.suspiciousReasons || []).join('; '),
      activity.createdAt.toISOString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((cell) => (typeof cell === 'string' ? `"${cell}"` : cell))
          .join(','),
      ),
    ].join('\n');

    return csvContent;
  }
}
