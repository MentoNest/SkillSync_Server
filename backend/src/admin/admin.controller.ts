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

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('mentors/:id/verify')
  verifyMentor(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.verifyMentor(id, req.user!.sub, body.notes);
  }

  @Delete('mentors/:id/verify')
  revokeVerification(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.adminService.revokeVerification(id, req.user!.sub);
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
}
