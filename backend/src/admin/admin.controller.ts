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
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiPaginationQuery } from '../common/pagination/decorators/api-pagination-query.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AdminService } from './admin.service';

@ApiTags('admin')
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
  @ApiPaginationQuery()
  getProfileHistory(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.adminService.getProfileHistory(
      userId,
      limit ? Math.min(parseInt(limit, 10) || 50, 500) : 50,
      page ? parseInt(page, 10) || 1 : 1,
    );
  }
}
