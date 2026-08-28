import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { UserStatus } from '../user/entities/user.entity';

@ApiTags('Admin')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminDashboardService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard stats retrieved' })
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Get user management list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'profileType', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Users retrieved' })
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('profileType') profileType?: string,
  ) {
    return this.adminService.getUserManagement({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      status,
      profileType,
    });
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a user' })
  @ApiResponse({ status: 200, description: 'User suspended' })
  async suspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    await this.adminService.suspendUser(id, reason, req.user.id);
    return { success: true };
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a user' })
  @ApiResponse({ status: 200, description: 'User reactivated' })
  async reactivateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ) {
    await this.adminService.reactivateUser(id, req.user.id);
    return { success: true };
  }

  // #1174: view soft-deleted accounts
  @Get('users/deleted')
  @ApiOperation({ summary: 'List soft-deleted users (#1174)' })
  @ApiResponse({ status: 200, description: 'Soft-deleted users retrieved' })
  async getDeletedUsers() {
    return this.adminService.getDeletedUsers();
  }

  // #1174: hard-delete a soft-deleted user once its grace period has elapsed
  @Delete('users/:userId/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a soft-deleted user past its grace period (#1174)' })
  @ApiResponse({ status: 200, description: 'User permanently deleted' })
  async permanentlyDeleteUser(@Param('userId', ParseUUIDPipe) userId: string, @Request() req: any) {
    return this.adminService.permanentlyDeleteUser(userId, req.user.id);
  }

  // #1176: generic admin status transition endpoint
  @Patch('users/:userId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change a user's lifecycle status (#1176)" })
  @ApiResponse({ status: 200, description: 'Status changed' })
  async setUserStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('status') status: string,
    @Request() req: any,
  ) {
    if (!Object.values(UserStatus).includes(status as UserStatus)) {
      throw new BadRequestException(`status must be one of: ${Object.values(UserStatus).join(', ')}`);
    }
    return this.adminService.setUserStatus(userId, status as UserStatus, req.user.id);
  }

  @Get('moderation')
  @ApiOperation({ summary: 'Get moderation reports' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Moderation reports retrieved' })
  async getModerationReports(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getModerationReports({
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get analytics data' })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] })
  @ApiResponse({ status: 200, description: 'Analytics data retrieved' })
  async getAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('granularity') granularity?: 'day' | 'week' | 'month',
  ) {
    return this.adminService.getAnalytics({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      granularity: granularity || 'day',
    });
  }

  @Get('health')
  @ApiOperation({ summary: 'Get system health status' })
  @ApiResponse({ status: 200, description: 'System health retrieved' })
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }
}
