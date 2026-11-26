import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { Role } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaginationQueryDto } from '../common/pagination/pagination.dto';
import { AdminService } from './admin.service';
import {
  AdminSuspensionUserParamDto,
  AdminUserParamDto,
  AnalyticsRangeQueryDto,
  AssignRoleDto,
  AuditQueryDto,
  CancelSessionDto,
  CreateReportDto,
  ListReportsQueryDto,
  ListSessionsQueryDto,
  ListUsersQueryDto,
  PaginatedSuspendedUsersResponseDto,
  ReportActionDto,
  ResolveDisputeDto,
  ResolveReportDto,
  SuspendUserDto,
  SuspendUserResponseDto,
  UnsuspendUserDto,
  UnsuspendUserResponseDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth('BearerAuth')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiOperation({
    summary: 'List users with pagination, filtering and sorting',
    operationId: 'adminListUsers',
  })
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('users/suspended')
  @ApiOperation({
    summary: 'List currently suspended users with active suspension details',
    operationId: 'adminListSuspendedUsers',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaginatedSuspendedUsersResponseDto,
  })
  listSuspendedUsers(@Query() query: PaginationQueryDto) {
    return this.admin.listSuspendedUsers(query);
  }

  @Get('users/:walletAddress')
  @ApiOperation({
    summary: 'View a user by wallet address',
    operationId: 'adminGetUser',
  })
  getUser(@Param() params: AdminUserParamDto) {
    return this.admin.getUser(params.walletAddress);
  }

  @Post('users/:userId/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspend a user temporarily or permanently',
    operationId: 'adminSuspendUserWithReason',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SuspendUserResponseDto,
  })
  suspendUserWithReason(
    @Param() params: AdminSuspensionUserParamDto,
    @Body() dto: SuspendUserDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.suspendUser(params.userId, admin.address, dto);
  }

  @Post('users/:userId/unsuspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lift an active suspension for a user',
    operationId: 'adminUnsuspendUser',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UnsuspendUserResponseDto,
  })
  unsuspendUser(
    @Param() params: AdminSuspensionUserParamDto,
    @Body() dto: UnsuspendUserDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.unsuspendUser(params.userId, admin.address, dto);
  }

  @Patch('users/:userId/suspend')
  @ApiOperation({ summary: 'Suspend a user', operationId: 'adminSuspendUser' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SuspendUserResponseDto,
  })
  suspendUser(
    @Param() params: AdminSuspensionUserParamDto,
    @CurrentUser() admin: AuthUser,
    @Body() dto?: Partial<SuspendUserDto>,
  ) {
    return this.admin.suspendUser(params.userId, admin.address, dto);
  }

  @Delete('users/:walletAddress')
  @ApiOperation({
    summary: 'Soft delete a user',
    operationId: 'adminDeleteUser',
  })
  deleteUser(
    @Param() params: AdminUserParamDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.deleteUser(params.walletAddress, admin.address);
  }

  @Post('users/:walletAddress/restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted user',
    operationId: 'adminRestoreUser',
  })
  restoreUser(
    @Param() params: AdminUserParamDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.restoreUser(params.walletAddress, admin.address);
  }

  @Put('users/:walletAddress/role')
  @ApiOperation({
    summary: 'Assign a role to a user',
    operationId: 'adminAssignRole',
  })
  assignRole(
    @Param() params: AdminUserParamDto,
    @Body() dto: AssignRoleDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.assignRole(params.walletAddress, dto, admin.address);
  }

  @Get('sessions')
  @ApiOperation({
    summary: 'List all sessions',
    operationId: 'adminListSessions',
  })
  listSessions(@Query() query: ListSessionsQueryDto) {
    return this.admin.listSessions(query);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'View a session', operationId: 'adminGetSession' })
  getSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getSession(id);
  }

  @Patch('sessions/:id/cancel')
  @ApiOperation({
    summary: 'Cancel a session as an administrator',
    operationId: 'adminCancelSession',
  })
  cancelSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSessionDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.cancelSession(id, admin.address, dto);
  }

  @Patch('sessions/:id/dispute')
  @ApiOperation({
    summary: 'Resolve a session dispute',
    operationId: 'adminResolveDispute',
  })
  resolveDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.resolveDispute(id, admin.address, dto);
  }

  @Get('reports')
  @ApiOperation({
    summary: 'List content reports',
    operationId: 'adminListReports',
  })
  listReports(@Query() query: ListReportsQueryDto) {
    return this.admin.listReports(query);
  }

  @Get('reports/:id')
  @ApiOperation({
    summary: 'View a content report',
    operationId: 'adminGetReport',
  })
  getReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getReport(id);
  }

  @Patch('reports/:id/resolve')
  @ApiOperation({
    summary: 'Resolve or dismiss a content report',
    operationId: 'adminResolveReport',
  })
  resolveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.resolveReport(id, admin.address, dto);
  }

  @Patch('reports/:id/action')
  @ApiOperation({
    summary: 'Take moderation action on a content report',
    operationId: 'adminReportAction',
  })
  takeReportAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportActionDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.takeReportAction(id, admin.address, dto);
  }

  @Delete('reports/:id')
  @ApiOperation({
    summary: 'Soft delete a content report',
    operationId: 'adminDeleteReport',
  })
  deleteReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.softDeleteReport(id, admin.address);
  }

  @Post('reports/:id/restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted content report',
    operationId: 'adminRestoreReport',
  })
  restoreReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.restoreReport(id, admin.address);
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Combined platform analytics',
    operationId: 'adminAnalytics',
  })
  analytics(@Query() query: AnalyticsRangeQueryDto) {
    return this.admin.analytics(query);
  }

  @Get('analytics/users')
  @ApiOperation({
    summary: 'User growth analytics',
    operationId: 'adminUserGrowth',
  })
  userGrowth(@Query() query: AnalyticsRangeQueryDto) {
    return this.admin.userGrowth(query.days);
  }

  @Get('analytics/sessions')
  @ApiOperation({
    summary: 'Session statistics',
    operationId: 'adminSessionStats',
  })
  sessionStats() {
    return this.admin.sessionStats();
  }

  @Get('analytics/revenue')
  @ApiOperation({ summary: 'Revenue placeholder', operationId: 'adminRevenue' })
  revenue() {
    return this.admin.revenue();
  }

  @Get('system-health')
  @ApiOperation({
    summary: 'System health status',
    operationId: 'adminSystemHealth',
  })
  systemHealth() {
    return this.admin.systemHealth();
  }

  @Get('audit-logs')
  @ApiOperation({
    summary: 'View audit logs with filters',
    operationId: 'adminAuditLogs',
  })
  auditLogs(@Query() query: AuditQueryDto) {
    return this.admin.auditLogs(query);
  }
}

@ApiTags('Reports')
@ApiBearerAuth('BearerAuth')
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly admin: AdminService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Report content as a signed-in user',
    operationId: 'createContentReport',
  })
  create(@Body() dto: CreateReportDto, @CurrentUser() reporter: AuthUser) {
    return this.admin.createReport(reporter.address, dto);
  }
}
