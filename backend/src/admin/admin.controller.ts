import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AdminService } from './admin.service';
import { UUIDParamDto } from '../common/dto/uuid-param.dto';
import { VerifyMentorBodyDto, AssignRoleParamDto } from './dto/admin.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { ReportQueryDto, ResolveReportDto } from './dto/report.dto';
import { SessionQueryDto } from './dto/session-query.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { Throttle } from '../auth/decorators/throttle.decorator';
import { AuthRole as AuthRoleEnum } from '../auth/enums/auth-role.enum';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
@Throttle(500, 60)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
  ) {}

  private getAudit(req: Request & { user?: JwtPayload }): {
    ipAddress: string | null;
    userAgent: string | null;
    deviceFingerprint: string | null;
  } {
    return {
      ipAddress: (req.ip || req.socket?.remoteAddress || null) as string | null,
      userAgent: req.headers['user-agent'] || null,
      deviceFingerprint: null,
    };
  }

  // User Management Endpoints
  @Get('users')
  listUsers(@Query() query: UserQueryDto) {
    return this.adminService.listUsers({
      search: query.search,
      role: query.role,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'DESC',
    });
  }

  @Get('users/:id')
  getUser(@Param() params: UUIDParamDto) {
    return this.adminService.getUser(params.id);
  }

  @Delete('users/:id')
  deleteUser(
    @Param() params: UUIDParamDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.deleteUser(params.id, req.user!.sub, this.getAudit(req));
  }

  @Post('users/:id/suspend')
  suspendUser(
    @Param() params: UUIDParamDto,
    @Body() body: SuspendUserDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.suspendUser(
      params.id,
      req.user!.sub,
      body.reason,
      body.durationDays ?? null,
    );
  }

  @Post('users/:id/unsuspend')
  unsuspendUser(
    @Param() params: UUIDParamDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.unsuspendUser(params.id, req.user!.sub);
  }

  @Post('users/:id/roles/:role')
  assignRole(
    @Param('id') userId: string,
    @Param('role') roleName: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.assignRole(userId, req.user!.sub, roleName, this.getAudit(req));
  }

  @Delete('users/:id/roles/:role')
  revokeRole(
    @Param('id') userId: string,
    @Param('role') roleName: string,
    @Body() body: { notes?: string },
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.revokeRole(userId, roleName, this.getAudit(req));
  }

  // Session Management Endpoints
  @Get('sessions')
  listSessions(@Query() query: SessionQueryDto) {
    return this.adminService.listSessions({
      userId: query.userId,
      status: query.status,
      search: query.search,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      sortBy: query.sortBy ?? 'startedAt',
      sortOrder: query.sortOrder ?? 'DESC',
    });
  }

  @Get('sessions/:id')
  getSession(@Param() params: UUIDParamDto) {
    return this.adminService.getSession(params.id);
  }

  @Post('sessions/:id/cancel')
  cancelSession(
    @Param() params: UUIDParamDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.cancelSession(params.id, req.user!.sub, this.getAudit(req));
  }

  @Post('sessions/:id/intervene')
  interveneSession(
    @Param() params: UUIDParamDto,
    @Body() body: { reason: string },
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.interveneSession(
      params.id,
      req.user!.sub,
      body.reason,
      this.getAudit(req),
    );
  }

  // Reporting System Endpoints
  @Get('reports')
  listReports(@Query() query: ReportQueryDto) {
    return this.adminService.listReports({
      status: query.status,
      type: query.type,
      reportedUserId: query.reportedUserId,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'DESC',
    });
  }

  @Get('reports/:id')
  getReport(@Param() params: UUIDParamDto) {
    return this.adminService.getReport(params.id);
  }

  @Patch('reports/:id/resolve')
  resolveReport(
    @Param() params: UUIDParamDto,
    @Body() body: ResolveReportDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.resolveReport(
      params.id,
      req.user!.sub,
      body.status,
      body.adminNotes,
      this.getAudit(req),
    );
  }

  // Content Moderation Endpoints
  @Get('flagged-content')
  listFlaggedContent(@Query() query: ReportQueryDto) {
    return this.adminService.listFlaggedContent({
      status: query.status as any,
      contentType: undefined,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'DESC',
    });
  }

  @Post('flagged-content/:id/remove')
  removeContent(
    @Param() params: UUIDParamDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.removeContent(params.id, req.user!.sub, this.getAudit(req));
  }

  @Post('flagged-content/:id/restore')
  restoreContent(
    @Param() params: UUIDParamDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.restoreContent(params.id, req.user!.sub, this.getAudit(req));
  }

  // Analytics Endpoints
  @Get('analytics')
  getAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.adminService.getAnalytics({
      startDate: query.startDate,
      endDate: query.endDate,
      groupBy: query.groupBy ?? 'day',
    });
  }

  // System Health Endpoint
  @Get('health')
  getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  // Existing endpoints (kept for backward compatibility)
  @Post('mentors/:id/feature')
  featureMentor(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.featureMentor(id, this.getAudit(req));
  }

  @Delete('mentors/:id/unfeature')
  unfeatureMentor(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.unfeatureMentor(id, this.getAudit(req));
  }

  @Post('mentors/:id/verify')
  verifyMentor(
    @Param() params: UUIDParamDto,
    @Body() body: VerifyMentorBodyDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.verifyMentor(params.id, req.user!.sub, body.notes);
  }

  @Delete('mentors/:id/verify')
  revokeVerification(
    @Param() params: UUIDParamDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.revokeVerification(params.id, req.user!.sub);
  }

  @Get('users/:userId/profile-history')
  getProfileHistory(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getProfileHistory(
      userId,
      limit ? Math.min(parseInt(limit, 10) || 50, 500) : 50,
      offset ? parseInt(offset, 10) || 0 : 0,
    );
  }

  @Get('users/suspended')
  listSuspendedUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.listSuspendedUsers(
      limit ? Math.min(parseInt(limit, 10) || 50, 500) : 50,
      offset ? parseInt(offset, 10) || 0 : 0,
    );
  }
}