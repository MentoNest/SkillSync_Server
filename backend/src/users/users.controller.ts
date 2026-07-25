import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateMentorProfileDto } from './dto/update-mentor-profile.dto.js';
import { UpdateMenteeProfileDto } from './dto/update-mentee-profile.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtAccessTokenPayload } from '../auth/interfaces/jwt-payload.interface.js';

@Controller('user/profile')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
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

  @Patch(':type')
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

  @Get(':type')
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
