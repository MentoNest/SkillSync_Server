import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UsersService } from './users.service';
import { CreateProfileDto } from './dto/create-profile.dto';

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

  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @Req() request: Request & { user?: JwtPayload },
    @Body() dto: CreateProfileDto,
  ) {
    if (!request.user) {
      throw new Error('User not found');
    }

    return this.usersService.createProfile(request.user.sub, dto, {
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
  }

  @Post(':id/roles/:role')
  @Roles(AuthRole.ADMIN)
  assignRole(@Param('id') id: string, @Param('role') role: string) {
    return this.usersService.assignRole(id, role);
  }

  @Delete(':id/roles/:role')
  @Roles(AuthRole.ADMIN)
  revokeRole(@Param('id') id: string, @Param('role') role: string) {
    return this.usersService.revokeRole(id, role);
  }
}
