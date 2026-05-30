import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UsersService } from './users.service';
import { UUIDParamDto } from '../common/dto/uuid-param.dto';
import { AssignRoleParamDto } from '../admin/dto/admin.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() request: Request & { user?: JwtPayload }) {
    if (!request.user) {
      throw new Error('User not found');
    }
    return this.usersService.findById(request.user.sub);
  }

  @Post(':id/roles/:role')
  @Roles(AuthRole.ADMIN)
  assignRole(@Param() params: AssignRoleParamDto) {
    return this.usersService.assignRole(params.id, params.role);
  }

  @Delete(':id/roles/:role')
  @Roles(AuthRole.ADMIN)
  revokeRole(@Param() params: AssignRoleParamDto) {
    return this.usersService.revokeRole(params.id, params.role);
  }
}
