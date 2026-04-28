// admin/admin.controller.ts
import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';
import { QueryDto } from './dto/query.dto';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // 👤 USER MANAGEMENT
  @Get('users')
  getUsers(@Query() query: QueryDto) {
    return this.adminService.getUsers(query);
  }

  @Patch('users/:id/suspend')
  suspendUser(@Param('id') id: string) {
    return this.adminService.suspendUser(id);
  }

  @Patch('users/:id/role')
  assignRole(@Param('id') id: string) {
    return this.adminService.assignRole(id);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.adminService.softDeleteUser(id);
  }

  // 📅 SESSION MANAGEMENT
  @Get('sessions')
  getSessions(@Query() query: QueryDto) {
    return this.adminService.getSessions(query);
  }

  @Patch('sessions/:id/cancel')
  cancelSession(@Param('id') id: string) {
    return this.adminService.cancelSession(id);
  }

  // 🚨 REPORTS / MODERATION
  @Get('reports')
  getReports(@Query() query: QueryDto) {
    return this.adminService.getReports(query);
  }

  @Patch('reports/:id/resolve')
  resolveReport(@Param('id') id: string) {
    return this.adminService.resolveReport(id);
  }

  // 📊 ANALYTICS
  @Get('analytics')
  getAnalytics() {
    return this.adminService.getAnalytics();
  }

  // 🧾 AUDIT LOGS
  @Get('audit-logs')
  getAuditLogs(@Query() query: QueryDto) {
    return this.adminService.getAuditLogs(query);
  }
}