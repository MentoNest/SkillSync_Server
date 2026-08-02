import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { AssignRoleDto } from './dto/assign-role.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

@Controller('admin/users/:userId/roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AuthRole.ADMIN)
export class AdminRolesController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async assignRole(
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.usersService.assignRole(userId, dto.role);
  }

  @Delete(':role')
  @HttpCode(HttpStatus.OK)
  async revokeRole(
    @Param('userId') userId: string,
    @Param('role', new ParseEnumPipe(AuthRole)) role: AuthRole,
  ) {
    return this.usersService.revokeRole(userId, role);
  }
}
