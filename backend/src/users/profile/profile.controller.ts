import { Body, Controller, HttpCode, Param, ParseEnumPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import type { JwtPayload } from '../../auth/guards/jwt-auth.guard';
import { Throttle } from '../../rate-limit/throttle.decorator';
import { CreateProfileDto, ProfileType, UpdateProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('user/profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a mentor or mentee profile for the authenticated user' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateProfileDto) {
    return this.profiles.create(userId, dto);
  }

  @Patch(':type')
  @Throttle(30, 3600)
  @ApiOperation({ summary: 'Partially update the authenticated user profile (admins may target userId)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('type', new ParseEnumPipe(ProfileType)) type: ProfileType,
    @Body() dto: UpdateProfileDto,
    @Query('userId') targetUserId?: string,
  ) {
    return this.profiles.update(user.sub, user.roles ?? [], type, dto, targetUserId);
  }
}
