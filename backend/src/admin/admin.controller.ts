import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AdminService } from './admin.service';
import { UUIDParamDto } from '../common/dto/uuid-param.dto';
import { VerifyMentorBodyDto } from './dto/admin.dto';
import { ProfileHistoryQueryDto } from '../availability/dto/availability-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';

import { UsersService } from '../users/users.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
  ) {}

  @Post('mentors/:id/feature')
  featureMentor(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const audit = {
      ipAddress: (req.ip || req.socket?.remoteAddress || null) as string | null,
      userAgent: req.headers['user-agent'] || null,
      deviceFingerprint: null,
    };
    return this.usersService.featureMentor(id, audit);
  }

  @Delete('mentors/:id/unfeature')
  unfeatureMentor(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    const audit = {
      ipAddress: (req.ip || req.socket?.remoteAddress || null) as string | null,
      userAgent: req.headers['user-agent'] || null,
      deviceFingerprint: null,
    };
    return this.usersService.unfeatureMentor(id, audit);
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
    @Query() query: ProfileHistoryQueryDto,
  ) {
    return this.adminService.getProfileHistory(
      userId,
      query.limit ? Math.min(parseInt(query.limit, 10) || 50, 500) : 50,
      query.offset ? parseInt(query.offset, 10) || 0 : 0,
    );
  }

  @Post('users/:userId/suspend')
  suspendUser(
    @Param('userId') userId: string,
    @Body() body: SuspendUserDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.suspendUser(
      userId,
      req.user!.sub,
      body.reason,
      body.durationDays ?? null,
    );
  }

  @Post('users/:userId/unsuspend')
  unsuspendUser(
    @Param('userId') userId: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.unsuspendUser(userId, req.user!.sub);
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
