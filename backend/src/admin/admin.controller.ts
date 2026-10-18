import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { RoleName } from '../rbac/roles';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { Throttle } from '../rate-limit/throttle.decorator';
import { AdminService } from './admin.service';
import {
  AssignRoleDto,
  AuditQueryDto,
  CancelSessionAdminDto,
  CreateReportDto,
  ListReportsQueryDto,
  ListSessionsQueryDto,
  ListUsersQueryDto,
  ResolveReportDto,
} from './dto/admin.dto';

/** Everything under /admin requires the admin role; admins get a higher rate limit. */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
@Throttle(600, 60)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // Users (suspend / unsuspend live in SuspensionController)
  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getUser(id);
  }

  @Delete('users/:id')
  deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') adminId: string) {
    return this.admin.deleteUser(id, adminId);
  }

  @Put('users/:id/role')
  assignRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRoleDto) {
    return this.admin.assignRole(id, dto);
  }

  // Sessions
  @Get('sessions')
  listSessions(@Query() query: ListSessionsQueryDto) {
    return this.admin.listSessions(query);
  }

  @Patch('sessions/:id/cancel')
  cancelSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: CancelSessionAdminDto,
  ) {
    return this.admin.cancelSession(id, adminId, dto.reason);
  }

  // Reports
  @Get('reports')
  listReports(@Query() query: ListReportsQueryDto) {
    return this.admin.listReports(query);
  }

  @Patch('reports/:id')
  resolveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.admin.resolveReport(id, adminId, dto);
  }

  // Analytics, health, audit
  @Get('analytics')
  analytics() {
    return this.admin.analytics();
  }

  @Get('system-health')
  systemHealth() {
    return this.admin.systemHealth();
  }

  @Get('audit-logs')
  auditLogs(@Query() query: AuditQueryDto) {
    return this.admin.auditLogs(query);
  }
}

/** Any signed-in user can report content; admins review reports under /admin/reports. */
@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly admin: AdminService) {}

  @Post()
  create(@CurrentUser('sub') reporterId: string, @Body() dto: CreateReportDto) {
    return this.admin.createReport(reporterId, dto);
  }
}
