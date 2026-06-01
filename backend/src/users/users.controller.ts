import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Query,
  Post,
  Patch,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RedisThrottlerGuard } from '../auth/guards/redis-throttler.guard';
import { AuthRole } from '../auth/enums/auth-role.enum';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UsersService } from './users.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Throttle } from '../auth/decorators/throttle.decorator';
import { UserStatus } from './enums/user-status.enum';
import { AssignRoleParamDto } from '../admin/dto/admin.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { UpdateDisplayNameDto } from './dto/update-display-name.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Req() request: Request & { user?: JwtPayload }) {
    if (!request.user) {
      throw new Error('User not found');
    }
    const user = await this.usersService.findById(request.user.sub);
    if (!user) throw new Error('User not found');
    return user;
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

  @Patch('profile/:type')
  @Throttle(30, 3600)
  @UseGuards(RedisThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() request: Request & { user?: JwtPayload },
    @Param('type', new ParseEnumPipe(AuthRole)) profileType: AuthRole,
    @Body() dto: UpdateProfileDto,
    @Query('userId') targetUserId?: string,
  ) {
    if (!request.user) {
      throw new Error('User not found');
    }

    return this.usersService.updateProfile(
      request.user.sub,
      profileType,
      dto,
      {
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      },
      targetUserId,
    );
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
  @Post(':id/status')
  @Roles(AuthRole.ADMIN)
  updateStatus(@Param('id') id: string, @Body('status') status: UserStatus) {
    return this.usersService.updateStatus(id, status);
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

  @Get('username/available')
  async checkUsernameAvailability(@Query('username') username: string) {
    return this.usersService.checkUsernameAvailability(username);
  }

  @Patch('username')
  async updateUsername(
    @Req() request: Request & { user?: JwtPayload },
    @Body() updateUsernameDto: UpdateUsernameDto,
  ) {
    if (!request.user) {
      throw new Error('User not found');
    }
    const audit = {
      ipAddress: (request.ip || request.socket?.remoteAddress || null) as string | null,
      userAgent: request.headers['user-agent'] || null,
      deviceFingerprint: null,
    };
    return this.usersService.updateUsername(request.user.sub, updateUsernameDto.username, audit);
  }

  @Patch('display-name')
  async updateDisplayName(
    @Req() request: Request & { user?: JwtPayload },
    @Body() updateDisplayNameDto: UpdateDisplayNameDto,
  ) {
    if (!request.user) {
      throw new Error('User not found');
    }
    return this.usersService.updateDisplayName(request.user.sub, updateDisplayNameDto.displayName ?? null);
  }

  @Get('username/:username')
  async findByUsername(@Param('username') username: string) {
    return this.usersService.findByUsername(username);
  }

  @Get('profiles/:identifier')
  async getPublicProfile(@Param('identifier') identifier: string) {
    // Try to find by username first, then by ID
    let user = await this.usersService.findByUsername(identifier);
    if (!user) {
      user = await this.usersService.findById(identifier);
    }
    if (!user) {
      throw new Error('Profile not found');
    }
    return user;
  }
}
