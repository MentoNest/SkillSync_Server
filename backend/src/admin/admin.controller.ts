import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  getAllUsers(
    @Query()
    query: {
      page?: number;
      limit?: number;
      status?: string;
      role?: string;
      search?: string;
    },
  ) {
    return this.adminService.getAllUsers(query);
  }

  @Get('users/:id')
  getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/suspend')
  suspendUser(
    @Param('id') id: string,
    @Body() body: { reason: string; duration?: number },
  ) {
    return this.adminService.suspendUser(id, body);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Post('users/:id/roles')
  assignRole(
    @Param('id') id: string,
    @Body() body: { role: AuthRole },
  ) {
    return this.adminService.assignRole(id, body);
  }

  @Delete('users/:id/roles/:roleId')
  revokeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ) {
    return this.adminService.revokeRole(id, roleId);
  }

  @Get('stats/users')
  getUserStats() {
    return this.adminService.getUserStats();
  }

  @Get('stats/sessions')
  getSessionStats() {
    return this.adminService.getSessionStats();
  }

  @Get('stats/revenue')
  getRevenueStats() {
    return this.adminService.getRevenueStats();
  }

  @Get('audit-log')
  getAuditLog(
    @Query() query: { page?: number; limit?: number },
  ) {
    return this.adminService.getAuditLog(query);
  }
}
