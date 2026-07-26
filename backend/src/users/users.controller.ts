import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateMentorProfileDto } from './dto/update-mentor-profile.dto.js';
import { UpdateMenteeProfileDto } from './dto/update-mentee-profile.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserQueryDto } from './dto/user-query.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAccessTokenPayload } from '../auth/interfaces/jwt-payload.interface.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getMe(
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findById(req.user.sub);
    return UserResponseDto.fromEntity(user);
  }

  @Patch()
  async updateMe(
    @Body() dto: UpdateUserDto,
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateUser(req.user.sub, dto);
    return UserResponseDto.fromEntity(user);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteMe(
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ): Promise<UserResponseDto> {
    const user = await this.usersService.deactivateUser(req.user.sub);
    return UserResponseDto.fromEntity(user);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(AuthRole.ADMIN)
  async listUsers(@Query() query: UserQueryDto) {
    const result = await this.usersService.findAll(query);
    return {
      ...result,
      data: result.data.map((user) => UserResponseDto.fromEntity(user)),
    };
  }

  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @Body() dto: CreateProfileDto,
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ) {
    const userId = req.user.sub;

    if (dto.profileType === 'mentor') {
      return this.usersService.createMentorProfile(
        userId,
        dto.mentorData ?? {},
      );
    }
    return this.usersService.createMenteeProfile(userId, dto.menteeData ?? {});
  }

  @Patch('profile/:type')
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  async updateProfile(
    @Param('type') type: string,
    @Body() dto: UpdateMentorProfileDto | UpdateMenteeProfileDto,
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ) {
    const userId = req.user.sub;
    const requesterRoles = req.user.roles ?? [];

    if (type === 'mentor') {
      return this.usersService.updateMentorProfile(
        userId,
        userId,
        requesterRoles,
        dto as UpdateMentorProfileDto,
      );
    }
    if (type === 'mentee') {
      return this.usersService.updateMenteeProfile(
        userId,
        userId,
        requesterRoles,
        dto as UpdateMenteeProfileDto,
      );
    }
    return { message: 'Invalid profile type. Must be "mentor" or "mentee".' };
  }

  @Get('profile/:type')
  async getProfile(
    @Param('type') type: string,
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ) {
    const userId = req.user.sub;

    if (type === 'mentor') {
      return this.usersService.getMentorProfile(userId);
    }
    if (type === 'mentee') {
      return this.usersService.getMenteeProfile(userId);
    }
    return { message: 'Invalid profile type. Must be "mentor" or "mentee".' };
  }
}
