import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { AdminService } from './admin.service';
import { UpdateRolesDto } from './dto/update-roles.dto';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly suspiciousActivityService: SuspiciousActivityService,
  ) {}

  @Get('users')
  listUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.listUsers(query.page ?? 1, query.limit ?? 20);
  }

  @Get('analytics')
  getAnalytics() {
    return this.adminService.getAnalytics();
  }

  @Get('suspicious-activity')
  @ApiOperation({ summary: 'List recent suspicious authentication events' })
  getSuspiciousActivity() {
    return this.suspiciousActivityService.getRecentEvents();
  }

  @Get('users/:id')
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id/roles')
  updateUserRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolesDto,
  ) {
    return this.adminService.updateUserRoles(id, dto.roles);
  }

  @Post('users/:id/suspend')
  suspendUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.suspendUser(id);
  }

  @Post('users/:id/unsuspend')
  unsuspendUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.unsuspendUser(id);
  }
}
