import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ProfileHistoryService } from './providers/profile-history.service';
import { ProfileHistoryQueryDto } from './dto/profile-history-query.dto';
import { ProfileHistory } from './entities/profile-history.entity';

@ApiTags('Profile History')
@ApiBearerAuth()
@Controller('profile-history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfileHistoryController {
  constructor(private readonly profileHistoryService: ProfileHistoryService) {}

  @Get('my-history')
  @ApiOperation({ summary: 'Get current user profile change history' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  async getMyHistory(@Request() req): Promise<ProfileHistory[]> {
    return this.profileHistoryService.getHistoryByUser(req.user.id);
  }

  @Get('user/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get profile history for a specific user (Admin only)' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getUserHistory(@Param('userId') userId: string): Promise<ProfileHistory[]> {
    return this.profileHistoryService.getHistoryByUser(userId);
  }

  @Get('profile/:profileId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get history for a specific profile (Admin only)' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getProfileHistory(@Param('profileId') profileId: string): Promise<ProfileHistory[]> {
    return this.profileHistoryService.getHistoryByProfile(profileId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all profile history with pagination (Admin only)' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getAllHistory(@Query() query: ProfileHistoryQueryDto): Promise<{ data: ProfileHistory[]; total: number }> {
    return this.profileHistoryService.getAllHistory(query.page, query.limit);
  }
}
